import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, Check, LogIn, Loader2, Pencil, Plus, Power, RefreshCw, X } from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import {
  createWorkspace,
  fetchAllCompanies,
  switchCompany,
  updateCompany,
  type Company,
} from "../utils/jobsApi";

/**
 * Super admin: every company workspace on the platform. Each company sees only its own users, resumes,
 * roles, careers page, settings and templates.
 */

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** "abc.com, @abc.in" -> ["abc.com", "abc.in"] */
const parseDomains = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

const currentCompanyId = (): string | undefined => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}").company_id;
  } catch {
    return undefined;
  }
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">
        {label} {hint && <span className="font-normal text-slate-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function NewCompanyForm({ onSaved, onCancel }: { onSaved: (c: Company) => void; onCancel: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domains, setDomains] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const shownSlug = slugTouched ? slug : slugify(name);
  const domainList = parseDomains(domains);
  const emailDomain = adminEmail.trim().toLowerCase().split("@")[1] || "";
  const emailMismatch = !!adminEmail && domainList.length > 0 && !domainList.includes(emailDomain);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await createWorkspace({
        name: name.trim(),
        slug: slugify(shownSlug),
        email_domains: domainList,
        admin: { full_name: adminName.trim(), email: adminEmail.trim(), password: adminPassword },
      });
      toast(`${saved.name} is ready. ${adminEmail.trim()} can sign in now.`, "success");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
      <h2 className="text-sm font-bold text-slate-900">New company</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Company name">
          <input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="ABC Technologies" className={inputClass} />
        </Field>
        <Field label="Careers page address" hint="letters, numbers, dashes">
          <input
            required
            maxLength={60}
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            onBlur={() => setSlug(slugify(shownSlug))}
            placeholder="abc"
            className={inputClass}
          />
        </Field>
        <Field label="Email domains" hint="optional, comma separated">
          <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="abc.com" className={inputClass} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        {domainList.length
          ? `Only ${domainList.map((d) => "@" + d).join(", ")} addresses can be added as this company's users.`
          : "Leave domains empty to allow any email address."}
      </p>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">First administrator</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Full name">
            <input required minLength={2} maxLength={100} value={adminName} onChange={(e) => setAdminName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input required type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder={domainList[0] ? `hr@${domainList[0]}` : "hr@company.com"} className={inputClass} />
          </Field>
          <Field label="Temporary password" hint="at least 6 characters">
            <input required minLength={6} type="text" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {emailMismatch && <p className="mt-1 text-xs text-rose-600">The administrator's email must be at {domainList.map((d) => "@" + d).join(", ")}.</p>}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          disabled={saving || !name.trim() || !slugify(shownSlug) || emailMismatch}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Create company
        </button>
      </div>
    </form>
  );
}

function DomainsEditor({ company, onSaved, onCancel }: { company: Company; onSaved: (c: Company) => void; onCancel: () => void }) {
  const { toast } = useFeedback();
  const [value, setValue] = useState(company.email_domains.join(", "));
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateCompany(company.id, { email_domains: parseDomains(value) });
      toast("Email domains saved. They apply to users added from now on.", "success");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the domains.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="abc.com, abc.in" className={`${inputClass} max-w-xs`} />
      <button disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:underline">Cancel</button>
    </form>
  );
}

export default function Companies() {
  const { toast, confirm } = useFeedback();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingDomains, setEditingDomains] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const here = currentCompanyId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompanies(await fetchAllCompanies());
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

  const replace = (changed: Company) =>
    setCompanies((list) => (list.some((c) => c.id === changed.id) ? list.map((c) => (c.id === changed.id ? { ...c, ...changed } : c)) : [...list, changed]));

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

  const open = async (company: Company) => {
    setOpening(company.id);
    try {
      await switchCompany(company.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the workspace.", "error");
      setOpening(null);
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500">Each company has its own workspace. Its resumes, users and settings are visible only to it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {adding ? <X size={16} /> : <Plus size={16} />} Add company
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {adding && (
        <NewCompanyForm
          onCancel={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            replace(c);
          }}
        />
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading companies…
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Building2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{c.name}</span>
                      {c.is_default && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Platform</span>}
                      {c.id === here && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">You are here</span>}
                      {!c.is_active && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Turned off</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {c.users_count ?? 0} users · {c.resumes_count ?? 0} resumes · {c.open_roles_count} open roles · /careers/{c.slug}
                    </p>
                    <div className="mt-1 text-xs">
                      {editingDomains === c.id ? (
                        <DomainsEditor
                          company={c}
                          onCancel={() => setEditingDomains(null)}
                          onSaved={(saved) => {
                            setEditingDomains(null);
                            replace(saved);
                          }}
                        />
                      ) : (
                        <span className="text-slate-600">
                          Email domains:{" "}
                          {c.email_domains.length ? c.email_domains.map((d) => "@" + d).join(", ") : <span className="text-slate-400">any</span>}
                          <button onClick={() => setEditingDomains(c.id)} className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline">
                            <Pencil size={11} /> Edit
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!c.is_default && (
                    <button
                      onClick={() => toggleWorkspace(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Power size={13} /> {c.is_active ? "Turn off" : "Turn on"}
                    </button>
                  )}
                  <button
                    disabled={c.id === here || opening !== null}
                    onClick={() => open(c)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    {opening === c.id ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />} Open workspace
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
