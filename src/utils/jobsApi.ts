import { BASE_URL, apiFetch } from "./Api";

// Public careers types and calls live in src/careers/api.ts so the careers site can be hosted on its own.
import { readJson, type CareersPageSettings, type PublicJob } from "../careers/api";
export type { CareersPageSettings, PublicJob };

export interface JobOpening extends PublicJob {
  status: "OPEN" | "CLOSED";
  applications_count: number;
}

export interface JobApplicationRow {
  id: string;
  opening_id: string;
  opening_title: string;
  applicant_email: string;
  submitted_at: string;
  resume_id: string;
  candidate_id: string | null;
  resume_status: string;
  full_name: string | null;
  phone: string | null;
}

const JOB_OPENINGS = `${BASE_URL}/job-openings`;

// ── Staff (login) ───────────────────────────────────────────────────────────

export const fetchJobOpenings = async (): Promise<JobOpening[]> =>
  readJson(await apiFetch(JOB_OPENINGS));

export const createJobOpening = async (payload: {
  title: string;
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
  limit = 20
): Promise<{ items: JobApplicationRow[]; total: number }> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (openingId) params.set("opening_id", openingId);
  return readJson(await apiFetch(`${JOB_OPENINGS}/applications?${params.toString()}`));
};

export const fetchCareersPageSettings = async (): Promise<CareersPageSettings> =>
  readJson(await apiFetch(`${JOB_OPENINGS}/page-settings`));

export const updateCareersPageSettings = async (changes: Partial<CareersPageSettings>): Promise<CareersPageSettings> =>
  readJson(
    await apiFetch(`${JOB_OPENINGS}/page-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    })
  );
