import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { fetchCompanies, type Company } from "../utils/jobsApi";

/** One company a candidate applied to from its careers page, with the roles they applied for there. */
export interface AppliedCompany {
  id: string;
  name: string;
  roles: string[];
}

/** Companies (and roles) on a resume, from its applied_jobs list; older records only have company_name. */
export function appliedCompanies(resume: any): AppliedCompany[] {
  const byId = new Map<string, AppliedCompany>();
  for (const job of resume?.applied_jobs || []) {
    const id = job?.company_id;
    if (!id) continue;
    const entry: AppliedCompany = byId.get(id) ?? { id, name: job.company_name || "Company", roles: [] };
    if (job.job_title && !entry.roles.includes(job.job_title)) entry.roles.push(job.job_title);
    byId.set(id, entry);
  }
  if (!byId.size && resume?.company_id) {
    byId.set(resume.company_id, {
      id: resume.company_id,
      name: resume.company_name || "Company",
      roles: resume.job_title ? [resume.job_title] : [],
    });
  }
  return Array.from(byId.values());
}

/** Small pills naming the companies a candidate applied to. Hover shows the roles. */
export function CompanyPills({ companies, size = "sm" }: { companies: AppliedCompany[]; size?: "sm" | "md" }) {
  if (!companies.length) return null;
  const cls =
    size === "md"
      ? "px-2.5 py-0.5 text-xs rounded-lg"
      : "px-1.5 py-0.5 text-[11px] rounded-md";
  return (
    <>
      {companies.map((c) => (
        <span
          key={c.id}
          title={c.roles.length ? `Applied for ${c.roles.join(", ")}` : `Applied to ${c.name}`}
          className={`inline-flex w-fit items-center gap-1 border border-violet-200 bg-violet-50 font-semibold text-violet-700 ${cls}`}
        >
          <Building2 size={size === "md" ? 12 : 10} /> {c.name}
        </span>
      ))}
    </>
  );
}

/** Companies for the candidate filters. Empty when they cannot be loaded (for example, without staff access). */
export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);
  return companies;
}

/** "All companies" / one company / "No company". The value is a company id, "none", or "" for all. */
export function CompanyFilter({
  companies,
  value,
  onChange,
  className = "",
}: {
  companies: Company[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  if (!companies.length) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by company"
      className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold shadow-sm focus:border-indigo-500 focus:outline-none ${
        value ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-700"
      } ${className}`}
    >
      <option value="">All companies</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="none">Not applied to a company</option>
    </select>
  );
}
