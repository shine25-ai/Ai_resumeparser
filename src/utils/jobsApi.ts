import { BASE_URL, apiFetch } from "./Api";

// Public careers types and calls live in src/careers/api.ts so the careers site can be hosted on its own.
import { readJson, type CareersPageSettings, type PublicJob } from "../careers/api";
export type { CareersPageSettings, PublicJob };

export interface JobOpening extends PublicJob {
  status: "OPEN" | "CLOSED";
  applications_count: number;
  company_id: string;
  company_name?: string | null;
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
}

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
  payload: Partial<Pick<Company, "name" | "slug" | "status" | "email_domains" | "is_active">>
): Promise<Company> =>
  readJson(
    await apiFetch(`${COMPANIES}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchJobOpenings = async (companyId?: string): Promise<JobOpening[]> =>
  readJson(await apiFetch(`${JOB_OPENINGS}${withCompany(companyId)}`));

export const createJobOpening = async (payload: {
  title: string;
  company_id?: string;
  department?: string;
  location?: string;
  employment_type?: string;
  experience?: string;
  description?: string;
  responsibilities?: string[];
  required_skills?: string[];
  qualifications?: string[];
  preferred_skills?: string[];
  open_positions: number;
}) =>
  readJson(
    await apiFetch(JOB_OPENINGS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateJobOpening = async (id: string, payload: Partial<JobOpening>) =>
  readJson(
    await apiFetch(`${JOB_OPENINGS}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

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
export const fetchAllCompanies = async (): Promise<Company[]> => readJson(await apiFetch(`${COMPANIES}?all=true`));

export interface NewWorkspace {
  name: string;
  slug?: string;
  email_domains: string[];
  admin?: { full_name: string; email: string; password: string };
}

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
  window.location.assign("/");
};
