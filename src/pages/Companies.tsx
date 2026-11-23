import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive, ArchiveRestore, Briefcase, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck,
  CircleOff, Download, ExternalLink, Eye, Globe, Loader2, LogIn, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus,
  Power, RefreshCw, Search, User, Users, X,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { downloadFile } from "../utils/adminApi";
import {
  companiesExportUrl,
  fetchAllCompanies,
  fetchCompanySummary,
  setCompanyArchived,
  switchCompany,
  updateCompany,
  type Company,
  type CompanyChanges,
  type CompanyLimits,
  type CompanySummary,
} from "../utils/jobsApi";
import {
  EMPTY_LIMITS, Field, PlanFields, PlanPill, ProfileFields, StatCard, careersUrl, dateText, draftOf, inputClass,
  limitText, parseDomains, type ProfileDraft,
} from "../components/companies/companyForm";

/**
 * Super admin: every company workspace on the platform (SRS Screen 2): summary cards, filters, the company table
 * and the Company Details panel. Each company sees only its own users, candidates, jobs and settings.
 */

const PAGE_SIZE = 10;
const filterClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const currentCompanyId = (): string | undefined => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}").company_id;
  } catch {
    return undefined;
  }
};

const ACTION_LABELS: Record<string, string> = {
  "company.created": "Company created",
  "company.updated": "Company details changed",
  "company.archived": "Company archived",
  "company.restored": "Company restored",
  "branding.updated": "Branding changed",
  "career_page.published": "Career page published",
  "job.created": "Job created",
  "job.published": "Job published",
  "user.created": "User added",
  "invitation.sent": "User invited",
};
const actionText = (a: string) => ACTION_LABELS[a] || a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function StatusPill({ c }: { c: Company }) {
  if (c.is_archived) return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Archived</span>;
  return c.is_active ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Inactive</span>
  );
}

function Logo({ c, size = 36 }: { c: Pick<Company, "logo_url">; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 text-indigo-600" style={{ width: size, height: size }}>
      {c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 size={size / 2.2} />}
    </span>
  );
}

// ── Company Details panel (Screen 2 §5) ─────────────────────────────────────

type PanelTab = "overview" | "admins" | "settings" | "activity";

function EditCompany({ company, onSaved, onCancel }: { company: Company; onSaved: (c: Company) => void; onCancel: () => void }) {
  const { toast } = useFeedback();
  const [profile, setProfile] = useState<ProfileDraft>(draftOf(company));
  const [domains, setDomains] = useState(company.email_domains.join(", "));
  const [plan, setPlan] = useState(company.plan);
  const [validUntil, setValidUntil] = useState(company.plan_valid_until || "");
  const [limits, setLimits] = useState<CompanyLimits>({ ...EMPTY_LIMITS, ...company.limits });
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const changes: CompanyChanges = {
        ...profile, name: profile.name.trim(), email_domains: parseDomains(domains), plan, plan_valid_until: validUntil || null, limits,
      };
      onSaved(await updateCompany(company.id, changes));
      toast("Company saved.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <ProfileFields value={profile} onChange={setProfile} withName />
      <Field label="Email domains" hint="comma separated, empty = any"><input value={domains} onChange={(e) => setDomains(e.target.value)} className={inputClass} /></Field>
      <PlanFields plan={plan} validUntil={validUntil} limits={limits} onPlan={setPlan} onValidUntil={setValidUntil} onLimits={setLimits} />
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white py-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
        <button disabled={saving || !profile.name.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
      </div>
    </form>
  );
}

function CompanyDetails({
  company, here, opening, onClose, onSaved, onOpen,
}: {
  company: Company;
  here?: string;
  opening: string | null;
  onClose: () => void;
  onSaved: (c: Company) => void;
  onOpen: (c: Company) => void;
}) {
  const [tab, setTab] = useState<PanelTab>("overview");
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<CompanySummary | null>(null);

  useEffect(() => {
    setTab("overview");
    setEditing(false);
    setSummary(null);
    fetchCompanySummary(company.id).then(setSummary).catch(() => undefined);
  }, [company.id]);

  const careers = summary?.careers_url?.startsWith("http") ? summary.careers_url : careersUrl(company.slug);
  const a = company.address;
  const counts = summary?.counts;
  const rows: [React.ReactNode, string, React.ReactNode][] = [
    [<Briefcase size={15} />, "Industry", company.industry || "—"],
    [<Globe size={15} />, "Company URL", company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">{company.website} <ExternalLink size={11} /></a> : "—"],
    [<Globe size={15} />, "Career Page URL", <a href={careers} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-indigo-600 hover:underline">{careers} <ExternalLink size={11} /></a>],
    [<User size={15} />, "Contact Person", company.contact.name || "—"],
    [<Mail size={15} />, "Email", company.contact.email || "—"],
    [<Phone size={15} />, "Phone", company.contact.phone || "—"],
    [<MapPin size={15} />, "Address", [a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(", ") || "—"],
    [<Building2 size={15} />, "Plan", <span className="flex flex-wrap items-center gap-2"><PlanPill plan={company.plan} />{company.plan_valid_until && <span className="text-xs text-slate-500">(Valid till {dateText(company.plan_valid_until)})</span>}</span>],
    [<CalendarDays size={15} />, "Created On", dateText(company.created_at)],
  ];

  return (
    <aside className="flex max-h-[calc(100vh-150px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-lg font-bold text-slate-900">Company Details</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
      </div>

      <div className="flex items-center gap-3 px-5 pt-4">
        <Logo c={company} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">{company.short_name || company.name}</p>
          <p className="truncate text-xs text-slate-500">{company.name}</p>
        </div>
        <StatusPill c={company} />
      </div>

      <div className="mt-3 flex gap-4 overflow-x-auto border-b border-slate-100 px-5 text-sm">
        {([["overview", "Overview"], ["admins", "Admin Users"], ["settings", "Settings"], ["activity", "Activity"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setEditing(false); }} className={`-mb-px whitespace-nowrap border-b-2 px-1 py-2 font-medium ${tab === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
        {editing ? (
          <EditCompany company={company} onCancel={() => setEditing(false)} onSaved={(c) => { onSaved(c); setEditing(false); }} />
        ) : tab === "overview" ? (
          <div className="space-y-5">
            <dl className="space-y-2.5">
              {rows.map(([icon, k, v]) => (
                <div key={k} className="grid grid-cols-[20px_110px_1fr] items-start gap-2">
                  <span className="mt-0.5 text-slate-400">{icon}</span>
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="min-w-0 font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 font-bold text-slate-900">Recruitment Summary</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                {([
                  [<Briefcase size={18} className="text-sky-600" />, counts?.jobs ?? company.roles_count, "Jobs"],
                  [<Users size={18} className="text-violet-600" />, counts?.candidates ?? company.resumes_count ?? 0, "Candidates"],
                  [<CalendarDays size={18} className="text-orange-500" />, counts?.interviews ?? company.interviews_count ?? 0, "Interviews"],
                  [<CircleCheck size={18} className="text-emerald-600" />, counts?.hires ?? "—", "Hires"],
                ] as const).map(([icon, v, label]) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    {icon}
                    <span className="text-lg font-bold text-slate-900 tabular-nums">{typeof v === "number" ? v.toLocaleString() : v}</span>
                    <span className="text-[11px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
              {counts?.hires === null && <p className="mt-2 text-center text-[11px] text-slate-400">Hires are counted once the hiring pipeline is added.</p>}
            </section>
          </div>
        ) : tab === "admins" ? (
          !summary ? (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
          ) : summary.admins.length === 0 ? (
            <p className="text-slate-500">No company admin yet. Open the workspace and invite one from Users.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.admins.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{u.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{u.full_name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="text-right text-[11px] text-slate-500">
                    <p className={u.is_active ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{u.is_active ? "Active" : "Inactive"}</p>
                    <p>{u.last_login_at ? `Signed in ${dateText(u.last_login_at)}` : "Not signed in yet"}</p>
                  </div>
                </li>
              ))}
              <li className="pt-3 text-xs text-slate-500">{summary.counts.users} users in this company.</li>
            </ul>
          )
        ) : tab === "settings" ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-slate-500">Plan</dt><dd className="font-medium"><PlanPill plan={company.plan} /></dd></div>
              <div><dt className="text-xs text-slate-500">Valid until</dt><dd className="font-medium">{dateText(company.plan_valid_until)}</dd></div>
              <div><dt className="text-xs text-slate-500">Users</dt><dd className="font-medium">{company.users_count ?? 0} / {limitText(company.limits.users)}</dd></div>
              <div><dt className="text-xs text-slate-500">Active jobs</dt><dd className="font-medium">{company.open_roles_count} / {limitText(company.limits.active_jobs)}</dd></div>
              <div><dt className="text-xs text-slate-500">Storage</dt><dd className="font-medium">{company.limits.storage_mb ? `${company.limits.storage_mb} MB` : "No limit"}</dd></div>
              <div><dt className="text-xs text-slate-500">AI parses / month</dt><dd className="font-medium">{limitText(company.limits.ai_parses_per_month)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">Email domains</dt><dd className="font-medium">{company.email_domains.length ? company.email_domains.map((d) => "@" + d).join(", ") : "Any email address"}</dd></div>
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Tenant configuration (set by the company admin)</p>
              <ul className="grid grid-cols-2 gap-1.5 text-xs">
                {([
                  ["AI resume parsing", company.tenant_settings?.resume_parsing],
                  ["Duplicate check", company.tenant_settings?.duplicate_check],
                  ["Multi-department", company.tenant_settings?.multi_department],
                  ["Calendar scheduling", company.tenant_settings?.calendar_scheduling],
                ] as const).map(([k, on]) => (
                  <li key={k} className="flex items-center gap-1.5">{on ? <CircleCheck size={13} className="text-emerald-600" /> : <CircleOff size={13} className="text-slate-400" />}{k}</li>
                ))}
                <li className="col-span-2 text-slate-500">Data kept for {company.tenant_settings?.data_retention_months ? `${company.tenant_settings.data_retention_months} months` : "ever"}.</li>
              </ul>
            </div>
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={12} /> Change plan, limits or details</button>
          </div>
        ) : !summary ? (
          <p className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : summary.recent_activity.length === 0 ? (
          <p className="text-slate-500">No activity yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-slate-200 pl-4">
            {summary.recent_activity.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500" />
                <p className="font-medium text-slate-800">{actionText(e.action)}{e.entity_label ? `: ${e.entity_label}` : ""}</p>
                <p className="text-xs text-slate-500">{e.actor?.name ? `${e.actor.name} · ` : ""}{new Date(e.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {!editing && (
        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3">
          <a href={careers} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={13} /> View Portal</a>
          <button onClick={() => setEditing(true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={13} /> Edit Company</button>
          <button
            disabled={company.id === here || opening !== null || company.is_archived || !company.is_active}
            onClick={() => onOpen(company)}
            title="Open this company's workspace to manage its users, jobs and settings"
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {opening === company.id ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} Manage Users
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Row menu ──────────────────────────────────────────────────────────────────

function RowMenu({ c, here, onOpen, onToggle, onArchive }: { c: Company; here?: string; onOpen: () => void; onToggle: () => void; onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="More actions"><MoreHorizontal size={16} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button className={item} disabled={c.id === here || c.is_archived || !c.is_active} onClick={() => { setOpen(false); onOpen(); }}><LogIn size={14} /> Open workspace</button>
          {!c.is_default && !c.is_archived && <button className={item} onClick={() => { setOpen(false); onToggle(); }}><Power size={14} /> {c.is_active ? "Turn off" : "Turn on"}</button>}
          {!c.is_default && <button className={item} onClick={() => { setOpen(false); onArchive(); }}>{c.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {c.is_archived ? "Restore" : "Archive"}</button>}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "inactive" | "archived";
type SortKey = "newest" | "oldest" | "name" | "jobs" | "candidates";

export default function Companies() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [industry, setIndustry] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const here = currentCompanyId();
  const selectedId = params.get("company");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompanies(await fetchAllCompanies(true));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Wide screens show the details panel straight away, as in the mockup.
  useEffect(() => {
    if (!loading && !selectedId && companies.length && window.innerWidth >= 1280) {
      const first = companies.find((c) => !c.is_archived && !c.is_default) || companies[0];
      if (first) select(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("company", id);
    else next.delete("company");
    setParams(next, { replace: true });
  };

  const replace = (changed: Company) =>
    setCompanies((list) => (list.some((c) => c.id === changed.id) ? list.map((c) => (c.id === changed.id ? { ...c, ...changed } : c)) : [...list, changed]));

  const counts = useMemo(() => {
    const live = companies.filter((c) => !c.is_archived);
    return {
      total: live.length,
      active: live.filter((c) => c.is_active).length,
      inactive: live.filter((c) => !c.is_active).length,
      archived: companies.length - live.length,
      jobs: live.reduce((n, c) => n + (c.roles_count || 0), 0),
      candidates: live.reduce((n, c) => n + (c.resumes_count || 0), 0),
      interviews: live.reduce((n, c) => n + (c.interviews_count || 0), 0),
    };
  }, [companies]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (status === "archived" ? !c.is_archived : c.is_archived) return false;
      if (status === "active" && !c.is_active) return false;
      if (status === "inactive" && c.is_active) return false;
      if (industry && c.industry !== industry) return false;
      if (plan && c.plan !== plan) return false;
      if (!q) return true;
      return [c.name, c.short_name, c.slug, c.industry, c.contact?.email, ...(c.email_domains || [])].some((v) => (v || "").toLowerCase().includes(q));
    });
    const by: Record<SortKey, (a: Company, b: Company) => number> = {
      newest: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      oldest: (a, b) => (a.created_at || "").localeCompare(b.created_at || ""),
      name: (a, b) => a.name.localeCompare(b.name),
      jobs: (a, b) => b.roles_count - a.roles_count,
      candidates: (a, b) => (b.resumes_count || 0) - (a.resumes_count || 0),
    };
    return [...list].sort(by[sort]);
  }, [companies, search, status, industry, plan, sort]);

  useEffect(() => setPage(1), [search, status, industry, plan, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = companies.find((c) => c.id === selectedId) || null;
  // With the details panel open, the less important columns wait for wide screens.
  const wide = selected ? "hidden 2xl:table-cell" : "";

  const industries = useMemo(() => [...new Set(companies.map((c) => c.industry).filter(Boolean))].sort(), [companies]);
  const plans = useMemo(() => [...new Set(companies.map((c) => c.plan).filter(Boolean))].sort(), [companies]);

  const toggleWorkspace = async (company: Company) => {
    if (company.is_active) {
      const ok = await confirm({
        title: `Turn off ${company.name}?`,
        message: "Its users are signed out and cannot sign in until you turn it back on. Its data is kept.",
        confirmLabel: "Turn off",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      replace(await updateCompany(company.id, { is_active: !company.is_active }));
      toast(company.is_active ? `${company.name} is turned off.` : `${company.name} is turned on.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the company.", "error");
    }
  };

  const toggleArchive = async (company: Company) => {
    if (!company.is_archived) {
      const ok = await confirm({
        title: `Archive ${company.name}?`,
        message: "Its users can no longer sign in and its careers page goes offline. All its data is kept and you can restore it later.",
        confirmLabel: "Archive",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      replace(await setCompanyArchived(company.id, !company.is_archived));
      toast(company.is_archived ? `${company.name} is restored. Turn it on when it should be used again.` : `${company.name} is archived.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the company.", "error");
    }
  };

  const open = async (company: Company) => {
    setOpening(company.id);
    try {
      await switchCompany(company.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the workspace.", "error");
      setOpening(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(companiesExportUrl(status === "archived"), "companies.csv");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not export.", "error");
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setIndustry("");
    setPlan("");
    setSort("newest");
  };

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies <span className="text-lg font-semibold text-slate-500">– Manage Companies</span></h1>
          <p className="text-sm text-slate-500">Create, view and manage all companies on the platform.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} title="Refresh" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={16} /></button>
          <button onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export
          </button>
          <button onClick={() => navigate("/companies/new")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={16} /> Create Company
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard tone="blue" icon={<Building2 size={20} />} value={counts.total.toLocaleString()} label="Total Companies" />
        <StatCard tone="green" icon={<CircleCheck size={20} />} value={counts.active.toLocaleString()} label="Active" />
        <StatCard tone="red" icon={<CircleOff size={20} />} value={counts.inactive.toLocaleString()} label="Inactive" />
        <StatCard tone="teal" icon={<Briefcase size={20} />} value={counts.jobs.toLocaleString()} label="Total Jobs" />
        <StatCard tone="violet" icon={<Users size={20} />} value={counts.candidates.toLocaleString()} label="Total Candidates" />
        <StatCard tone="orange" icon={<CalendarDays size={20} />} value={counts.interviews.toLocaleString()} label="Total Interviews" />
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <div className="min-w-0 space-y-3">
          <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm [&>label]:min-w-[140px] [&>label]:flex-1">
            <label className="relative !min-w-[220px] !flex-[2]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company name, industry, email…" className={`${filterClass} pl-9`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={filterClass}>
                <option value="">All Industries</option>
                {industries.map((i) => <option key={i}>{i}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Status
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={filterClass}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived ({counts.archived})</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Plan
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={filterClass}>
                <option value="">All Plans</option>
                {plans.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Sort By
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={filterClass}>
                <option value="newest">Created Date (Newest)</option>
                <option value="oldest">Created Date (Oldest)</option>
                <option value="name">Name (A–Z)</option>
                <option value="jobs">Most Jobs</option>
                <option value="candidates">Most Candidates</option>
              </select>
            </label>
            <button onClick={resetFilters} className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><RefreshCw size={14} /> Reset</button>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading companies…</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No companies match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Company</th>
                      <th className="px-3 py-3">Industry</th>
                      <th className="px-3 py-3 text-right">Jobs</th>
                      <th className="px-3 py-3 text-right">Candidates</th>
                      <th className={`px-3 py-3 text-right ${wide}`}>Interviews</th>
                      <th className="px-3 py-3">Plan</th>
                      <th className="px-3 py-3">Status</th>
                      <th className={`px-3 py-3 ${wide}`}>Created On</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((c, i) => (
                      <tr key={c.id} className={`cursor-pointer ${c.id === selectedId ? "bg-indigo-50/60" : "hover:bg-slate-50"}`} onClick={() => select(c.id)}>
                        <td className="px-3 py-3 text-slate-500 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Logo c={c} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{c.name}</span>
                                {c.is_default && !selected && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Platform</span>}
                                {c.id === here && !selected && <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">You are here</span>}
                              </div>
                              <p className="text-xs text-slate-500">/careers/{c.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{c.industry || "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{c.roles_count.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{(c.resumes_count ?? 0).toLocaleString()}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${wide}`}>{(c.interviews_count ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-3"><PlanPill plan={c.plan} /></td>
                        <td className="px-3 py-3"><StatusPill c={c} /></td>
                        <td className={`px-3 py-3 whitespace-nowrap text-slate-500 ${wide}`}>{dateText(c.created_at)}</td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => select(c.id)} title="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                            <a href={careersUrl(c.slug)} target="_blank" rel="noreferrer" title="View careers page" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Eye size={15} /></a>
                            <RowMenu c={c} here={here} onOpen={() => open(c)} onToggle={() => toggleWorkspace(c)} onArchive={() => toggleArchive(c)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {shown.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                <span>Showing {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, shown.length)} of {shown.length} companies</span>
                <div className="flex items-center gap-1">
                  <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={15} /></button>
                  {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map((n) => (
                    <button key={n} onClick={() => setPage(n)} className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold ${n === page ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{n}</button>
                  ))}
                  <button disabled={page === pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={15} /></button>
                </div>
              </div>
            )}
          </section>
          <p className="text-xs text-slate-400">
            Plans and their limits are in <Link to="/platform/plans" className="font-medium text-indigo-600 hover:underline">Plans & Billing</Link>.
          </p>
        </div>

        {selected && (
          <CompanyDetails company={selected} here={here} opening={opening} onClose={() => select(null)} onSaved={replace} onOpen={open} />
        )}
      </div>
    </div>
  );
}
