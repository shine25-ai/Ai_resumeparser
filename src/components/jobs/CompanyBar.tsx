import { useState, type FormEvent } from "react";
import { Building2, Check, Copy, ExternalLink, Loader2, Pencil, Plus, X } from "lucide-react";
import { useFeedback } from "../ui/Feedback";
import { createCompany, updateCompany, type Company } from "../../utils/jobsApi";

// Where the public careers site lives. Defaults to this app until it moves to its own site.
const CAREERS_SITE_URL: string = (import.meta.env.VITE_CAREERS_SITE_URL || "").replace(/\/+$/, "");

/** The company's public careers page. The default company keeps its older address, so shared links still work. */
export const careersUrl = (company: Company) => {
  if (CAREERS_SITE_URL) return company.is_default ? CAREERS_SITE_URL : `${CAREERS_SITE_URL}?company=${company.slug}`;
  return `${window.location.origin}${company.is_default ? "/jobs" : `/careers/${company.slug}`}`;
};

/** 'Acme Tech Pvt. Ltd' -> 'acme-tech-pvt-ltd', the same rule the server uses. */
const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

const inputClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

function CompanyForm({
  company,
  onSaved,
  onCancel,
}: {
  company?: Company;
  onSaved: (company: Company) => void;
  onCancel: () => void;
}) {
  const { toast } = useFeedback();
  const [name, setName] = useState(company?.name ?? "");
  const [slug, setSlug] = useState(company?.slug ?? "");
  // A new company's address follows its name until it is typed in.
  const [slugTouched, setSlugTouched] = useState(!!company);
  const [saving, setSaving] = useState(false);
  const shownSlug = slugTouched ? slug : slugify(name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { name: name.trim(), slug: slugify(shownSlug) };
      const saved = company ? await updateCompany(company.id, payload) : await createCompany(payload);
      toast(company ? "Company updated." : `${saved.name} added. Add its roles below.`, "success");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">Company name</span>
        <input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Technologies" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">
          Page address <span className="font-normal text-slate-400">· letters, numbers and dashes</span>
        </span>
        <input
          required
          maxLength={60}
          value={shownSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          onBlur={() => setSlug(slugify(shownSlug))}
          placeholder="acme"
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button disabled={saving || !name.trim() || !slugify(shownSlug)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {company ? "Save" : "Add company"}
        </button>
      </div>
      {company && company.slug !== slugify(shownSlug) && (
        <p className="text-xs text-amber-700 sm:col-span-3">Links shared with the old address will stop working.</p>
      )}
    </form>
  );
}

/** Pick the company whose roles, page text and applications are shown, and manage companies. */
export default function CompanyBar({
  companies,
  selected,
  onSelect,
  onChanged,
}: {
  companies: Company[];
  selected: Company | undefined;
  onSelect: (id: string) => void;
  onChanged: (company: Company) => void;
}) {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [copied, setCopied] = useState(false);
  const link = selected ? careersUrl(selected) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Could not copy. Select the link and copy it.", "error");
    }
  };

  const toggleStatus = async () => {
    if (!selected) return;
    try {
      const updated = await updateCompany(selected.id, { status: selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      toast(updated.status === "ACTIVE" ? "Careers page is on." : "Careers page is off. Its link now shows “not found”.", "success");
      onChanged(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the company.", "error");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <Building2 size={18} className="text-indigo-600" />
          <span className="sr-only">Company</span>
          <select
            value={selected?.id ?? ""}
            onChange={(e) => {
              setMode(null);
              onSelect(e.target.value);
            }}
            className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.open_roles_count} open){c.status === "INACTIVE" ? " · page off" : ""}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <button onClick={() => setMode(mode === "edit" ? null : "edit")} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline">
            <Pencil size={13} /> Edit
          </button>
        )}
        {selected && !selected.is_default && (
          <button onClick={toggleStatus} className="text-sm font-medium text-indigo-600 hover:underline">
            {selected.status === "ACTIVE" ? "Turn page off" : "Turn page on"}
          </button>
        )}
        <button
          onClick={() => setMode(mode === "add" ? null : "add")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {mode === "add" ? <X size={14} /> : <Plus size={14} />} Add company
        </button>
      </div>

      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Careers page:</span>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-indigo-600 hover:underline">
            {link} <ExternalLink size={12} />
          </a>
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
          {selected.status === "INACTIVE" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Page off</span>}
        </div>
      )}
      {selected && !selected.is_default && (
        <p className="mt-1 text-xs text-slate-400">
          Single file: <code>careers.html?company={selected.slug}</code> · Embed: <code>data-company="{selected.slug}"</code>
        </p>
      )}

      {mode === "add" && (
        <CompanyForm
          onCancel={() => setMode(null)}
          onSaved={(company) => {
            setMode(null);
            onChanged(company);
            onSelect(company.id);
          }}
        />
      )}
      {mode === "edit" && selected && (
        <CompanyForm
          key={selected.id}
          company={selected}
          onCancel={() => setMode(null)}
          onSaved={(company) => {
            setMode(null);
            onChanged(company);
          }}
        />
      )}
    </section>
  );
}
