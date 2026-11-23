import { BASE_URL, apiFetch } from "./Api";
import { clearBrandingCache } from "../theme/brandingCache";

// Public careers types and calls live in src/careers/api.ts so the careers site can be hosted on its own.
import { readJson, type CareersPageSettings, type PublicJob } from "../careers/api";
export type { CareersPageSettings, PublicJob };

export type JobStatus = "DRAFT" | "PENDING_APPROVAL" | "OPEN" | "CLOSED" | "ARCHIVED";
export type JobAction = "submit" | "publish" | "approve" | "reject" | "close" | "reopen" | "archive" | "restore";

export interface JobRound {
  order?: number;
  name: string;
  interview_type: string;
  duration_minutes: number;
}

export interface JobHistoryEntry {
  from: JobStatus | null;
  to: JobStatus;
  action?: JobAction;
  at: string;
  by: { id?: string; name?: string };
  note?: string;
}

/** A job as staff see it (SRS Screens 5 and 6). "OPEN" is Published. */
export interface JobOpening extends PublicJob {
  status: JobStatus;
  status_label: string;
  applications_count: number;
  interviews_count: number;
  selected_count: number;
  accepting: boolean;
  company_id: string;
  company_name?: string | null;
  code: string;
  category: string;
  work_mode: "" | "Onsite" | "Hybrid" | "Remote";
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: "year" | "month" | "hour";
  show_salary: boolean;
  notice_period: string;
  certifications: string[];
  primary_skills: string[];
  secondary_skills: string[];
  what_we_offer: string[];
  tags: string[];
  additional_requirements: string;
  tagline: string;
  requirements: string[];
  nice_to_have: string[];
  rounds: JobRound[];
  closing_date: string | null;
  hiring_manager: { id: string; name: string } | null;
  notify_emails: string[];
  send_candidate_confirmation: boolean;
  accept_applications: boolean;
  status_history: JobHistoryEntry[];
  created_by?: { id?: string; name?: string } | null;
  published_at?: string | null;
  closed_at?: string | null;
  updated_at?: string;
}

/** The fields of the job form. */
export type JobForm = Partial<Omit<JobOpening, "id" | "status" | "status_label" | "applications_count" | "interviews_count" | "selected_count" | "accepting" | "status_history" | "code" | "company_id" | "company_name">>;

export interface JobTemplate {
  id: string;
  name: string;
  job: JobForm;
  created_at: string;
}

/** A company with its own roles, careers page text and careers page address. */
export interface Company {
  id: string;
  name: string;
  /** Careers page address: /careers/<slug> or ?company=<slug> */
  slug: string;
  status: "ACTIVE" | "INACTIVE";
  roles_count: number;
  open_roles_count: number;
  /** Roles and links from before companies existed belong to it; its page needs no ?company. */
  is_default: boolean;
  /** Users must have an email at one of these domains; empty allows any email. */
  email_domains: string[];
  /** The whole workspace is on (its users can sign in). `status` only turns the careers page off. */
  is_active: boolean;
  /** Super admin list only */
  users_count?: number;
  resumes_count?: number;
  interviews_count?: number;
  // Profile (SRS 3.3)
  logo_url: string;
  /** Brand name shown in the portal ("ShineLogics" for "ShineLogics Technologies Pvt. Ltd."). */
  short_name: string;
  company_type: string;
  tenant_settings: TenantSettings;
  plan_valid_until: string | null;
  website: string;
  industry: string;
  description: string;
  company_size: string;
  timezone: string;
  address: CompanyAddress;
  contact: CompanyContact;
  // Plan, set by the super admin (0 = no limit)
  plan: string;
  billing_mode: "manual" | "gateway";
  limits: CompanyLimits;
  archived_at: string | null;
  is_archived: boolean;
  created_at?: string;
}

/** Company Settings → Tenant configuration. Job approval is in the job settings. */
export interface TenantSettings {
  resume_parsing: boolean;
  duplicate_check: boolean;
  multi_department: boolean;
  calendar_scheduling: boolean;
  candidate_registration: boolean;
  /** Months; 0 = keep until deleted. One of 0, 6, 12, 24, 36, 60. */
  data_retention_months: number;
}

export interface CompanyAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

export interface CompanyContact {
  name: string;
  email: string;
  phone: string;
}

export interface CompanyLimits {
  users: number;
  active_jobs: number;
  storage_mb: number;
  ai_parses_per_month: number;
}

/** Fields the company form can send. Plan, limits, domains and is_active are the super admin's. */
export type CompanyChanges = Partial<
  Pick<
    Company,
    | "name" | "slug" | "status" | "email_domains" | "is_active" | "logo_url" | "website" | "industry"
    | "description" | "company_size" | "timezone" | "plan" | "short_name" | "company_type" | "plan_valid_until"
  > & {
    address: Partial<CompanyAddress>; contact: Partial<CompanyContact>; limits: Partial<CompanyLimits>;
    tenant_settings: Partial<TenantSettings>;
  }
>;

export interface JobApplicationRow {
  id: string;
  opening_id: string;
  opening_title: string;
  company_id: string;
  company_name: string | null;
  applicant_email: string;
  submitted_at: string;
  /** From the apply form: how they heard about the role, and their own note. */
  heard_from: string | null;
  note: string | null;
  resume_id: string;
  candidate_id: string | null;
  resume_status: string;
  full_name: string | null;
  phone: string | null;
}

const JOB_OPENINGS = `${BASE_URL}/job-openings`;
const COMPANIES = `${BASE_URL}/companies`;

const withCompany = (companyId?: string) => (companyId ? `?company_id=${encodeURIComponent(companyId)}` : "");

// ── Staff (login) ───────────────────────────────────────────────────────────

export const fetchCompanies = async (): Promise<Company[]> => readJson(await apiFetch(COMPANIES));

export const updateCompany = async (
  id: string,
  payload: CompanyChanges
): Promise<Company> =>
  readJson(
    await apiFetch(`${COMPANIES}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchJobOpenings = async (_companyId?: string, includeArchived = false): Promise<JobOpening[]> =>
  readJson(await apiFetch(`${JOB_OPENINGS}${includeArchived ? "?include_archived=true" : ""}`));

export const fetchJobOpening = async (id: string): Promise<JobOpening> => readJson(await apiFetch(`${JOB_OPENINGS}/${id}`));

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** New jobs are drafts; `publish: true` also publishes (or sends for approval). */
export const createJobOpening = async (payload: JobForm & { publish?: boolean }): Promise<JobOpening> =>
  readJson(await apiFetch(JOB_OPENINGS, jsonBody("POST", payload)));

export const updateJobOpening = async (id: string, payload: JobForm & { status?: JobStatus }): Promise<JobOpening> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/${id}`, jsonBody("PATCH", payload)));

export const jobAction = async (id: string, action: JobAction, note = ""): Promise<JobOpening> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/${id}/actions/${action}`, jsonBody("POST", { note })));

export const duplicateJob = async (id: string): Promise<JobOpening> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/${id}/duplicate`, { method: "POST" }));

export interface JobStats {
  total: number;
  active: number;
  draft: number;
  pending_approval: number;
  closed: number;
  archived: number;
  applications: number;
  /** Filled once the pipeline records hires (Phase 7). */
  avg_days_to_hire: number | null;
}

export const fetchJobStats = async (): Promise<JobStats> => readJson(await apiFetch(`${JOB_OPENINGS}/stats`));

export const jobsExportUrl = (includeArchived = false) => `${JOB_OPENINGS}/export${includeArchived ? "?include_archived=true" : ""}`;
export const JOBS_IMPORT_TEMPLATE_URL = `${JOB_OPENINGS}/import/template`;

export interface JobImportResult {
  created: { row: number; id: string; code: string; title: string }[];
  errors: { row: number; message: string }[];
}

/** Each CSV row becomes a draft job. */
export const importJobs = async (file: File): Promise<JobImportResult> => {
  const form = new FormData();
  form.append("file", file);
  return readJson(await apiFetch(`${JOB_OPENINGS}/import`, { method: "POST", body: form }));
};

export const fetchJobSettings = async (): Promise<{ require_approval: boolean }> => readJson(await apiFetch(`${JOB_OPENINGS}/settings`));

export const saveJobSettings = async (require_approval: boolean): Promise<{ require_approval: boolean }> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/settings`, jsonBody("PUT", { require_approval })));

export const fetchJobTemplates = async (): Promise<JobTemplate[]> => readJson(await apiFetch(`${JOB_OPENINGS}/templates`));

export const saveJobTemplate = async (name: string, from: { from_job_id?: string; job?: JobForm }): Promise<JobTemplate> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/templates`, jsonBody("POST", { name, ...from })));

export const deleteJobTemplate = async (id: string): Promise<void> => {
  await readJson(await apiFetch(`${JOB_OPENINGS}/templates/${id}`, { method: "DELETE" }));
};

export const fetchJobApplications = async (
  openingId: string | "",
  page = 1,
  limit = 20,
  companyId?: string
): Promise<{ items: JobApplicationRow[]; total: number }> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (openingId) params.set("opening_id", openingId);
  if (companyId) params.set("company_id", companyId);
  return readJson(await apiFetch(`${JOB_OPENINGS}/applications?${params.toString()}`));
};

export const fetchCareersPageSettings = async (companyId?: string): Promise<CareersPageSettings> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/page-settings${withCompany(companyId)}`));

export const updateCareersPageSettings = async (
  changes: Partial<CareersPageSettings>,
  companyId?: string
): Promise<CareersPageSettings> =>
  readJson(
    await apiFetch(`${JOB_OPENINGS}/page-settings${withCompany(companyId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    })
  );

// ── Super admin: company workspaces ─────────────────────────────────────────

/** Every company, with user and resume counts (super admin). */
/** The company details panel (Companies → a company). */
export interface CompanySummary {
  company: Company;
  careers_url: string;
  counts: { jobs: number; open_jobs: number; users: number; candidates: number; applications: number; interviews: number; hires: number | null };
  admins: { id: string; full_name: string; email: string; role: string; is_active: boolean; last_login_at?: string | null }[];
  recent_activity: { action: string; entity_label: string; created_at: string; actor?: { name?: string } }[];
}

export const fetchCompanySummary = async (id: string): Promise<CompanySummary> => readJson(await apiFetch(`${COMPANIES}/${id}/summary`));

export const companiesExportUrl = (includeArchived = false) => `${COMPANIES}/export${includeArchived ? "?include_archived=true" : ""}`;

export const fetchAllCompanies = async (includeArchived = false): Promise<Company[]> =>
  readJson(await apiFetch(`${COMPANIES}?all=true${includeArchived ? "&include_archived=true" : ""}`));

export interface NewWorkspace extends CompanyChanges {
  name: string;
  slug?: string;
  email_domains: string[];
  admin?: { full_name: string; email: string; password: string };
  /** Colours and logo, saved as the new company's branding. */
  branding?: { colors?: Record<string, string>; logo_url?: string };
  /** The careers page headline. */
  career_headline?: string;
}

/** Super admin: archive (workspace off, careers page gone, hidden from the list) or restore a company. */
export const setCompanyArchived = async (id: string, archived: boolean): Promise<Company> =>
  readJson(await apiFetch(`${COMPANIES}/${id}/${archived ? "archive" : "restore"}`, { method: "POST" }));

export const createWorkspace = async (payload: NewWorkspace): Promise<Company> =>
  readJson(
    await apiFetch(COMPANIES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

/** Super admin: open another company's workspace. Stores the new tokens and profile, then reloads. */
export const switchCompany = async (companyId: string): Promise<void> => {
  const tokens = await readJson(
    await apiFetch(`${BASE_URL}/auth/switch-company`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId }),
    })
  );
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("refresh_token", tokens.refresh_token);
  const me = await readJson(await apiFetch(`${BASE_URL}/users/me`));
  localStorage.setItem("user", JSON.stringify(me));
  clearBrandingCache(); // the new company's branding loads after the reload
  window.location.assign("/");
};
