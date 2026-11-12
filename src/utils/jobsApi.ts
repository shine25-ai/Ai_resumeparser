import { BASE_URL, apiFetch } from "./Api";

export interface PublicJob {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  experience: string;
  description: string;
  open_positions: number;
  created_at: string;
}

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

const PUBLIC_JOBS = `${BASE_URL}/public/jobs`;
const JOB_OPENINGS = `${BASE_URL}/job-openings`;

const readJson = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.message || body?.detail;
    throw new Error(typeof detail === "string" ? detail : "Request failed. Please try again.");
  }
  return body.data ?? body;
};

// ── Public (no login) ───────────────────────────────────────────────────────

export const fetchPublicJobs = async (): Promise<PublicJob[]> =>
  readJson(await fetch(PUBLIC_JOBS));

export const requestApplicantCode = async (email: string) =>
  readJson(
    await fetch(`${PUBLIC_JOBS}/verification/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
  );

export const confirmApplicantCode = async (
  email: string,
  code: string
): Promise<{ applicant_token: string }> =>
  readJson(
    await fetch(`${PUBLIC_JOBS}/verification/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    })
  );

export const submitApplication = async (jobId: string, applicantToken: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return readJson(
    await fetch(`${PUBLIC_JOBS}/${jobId}/apply`, {
      method: "POST",
      headers: { "X-Applicant-Token": applicantToken },
      body: form,
    })
  );
};

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
