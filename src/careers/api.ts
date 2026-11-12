/**
 * Public careers API client. It has no login and no imports from the resume portal,
 * so the careers page can be embedded in any site (see src/careers/README.md).
 *
 * API address: set at runtime with setCareersApiBaseUrl (the embed's data-api attribute),
 * else VITE_CAREERS_API_BASE_URL, else VITE_API_BASE_URL, else the local backend.
 */

let apiBaseUrl: string =
  import.meta.env.VITE_CAREERS_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

/** Point the careers page at a resume portal API, e.g. "https://api.example.com/api/v1". */
export const setCareersApiBaseUrl = (url: string) => {
  apiBaseUrl = url.trim().replace(/\/+$/, "");
};

const publicJobsUrl = () => `${apiBaseUrl}/public/jobs`;

export interface PublicJob {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  experience: string;
  /** "About the role" text */
  description: string;
  responsibilities: string[];
  required_skills: string[];
  qualifications: string[];
  preferred_skills: string[];
  open_positions: number;
  created_at: string;
}

/** Editable text on the careers page. The header and footer are fixed. */
export interface CareersPageSettings {
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string;
  search_placeholder: string;
  listing_title: string;
  listing_subtitle: string;
  empty_message: string;
  success_title: string;
  success_message: string;
}

/** Shown while the saved text loads, or if it cannot be loaded. Matches the server defaults. */
export const DEFAULT_PAGE_SETTINGS: CareersPageSettings = {
  hero_eyebrow: "Careers at Shinelogics",
  hero_title: "Find work that moves you forward.",
  hero_subtitle: "Explore opportunities, build your skills and make an impact with us.",
  search_placeholder: "Search by job title or keyword...",
  listing_title: "Explore Open Positions",
  listing_subtitle: "Find the right opportunity to grow your career with us.",
  empty_message: "There are no open roles right now. Please check back later.",
  success_title: "Application submitted successfully",
  success_message: "Your resume is being processed. Thank you for applying.",
};

export const readJson = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.message || body?.detail;
    throw new Error(typeof detail === "string" ? detail : "Request failed. Please try again.");
  }
  return body.data ?? body;
};

/** Older roles may not have the newer fields; fill them so the page never crashes. */
const normalizeJob = (job: Partial<PublicJob> & { id: string; title: string }): PublicJob => ({
  department: "",
  location: "",
  employment_type: "",
  experience: "",
  description: "",
  open_positions: 0,
  created_at: "",
  ...job,
  responsibilities: job.responsibilities ?? [],
  required_skills: job.required_skills ?? [],
  qualifications: job.qualifications ?? [],
  preferred_skills: job.preferred_skills ?? [],
});

export const fetchPublicJobs = async (): Promise<PublicJob[]> =>
  ((await readJson(await fetch(publicJobsUrl()))) as PublicJob[]).map(normalizeJob);

export const fetchPageSettings = async (): Promise<CareersPageSettings> => ({
  ...DEFAULT_PAGE_SETTINGS,
  ...(await readJson(await fetch(`${publicJobsUrl()}/page`))),
});

export const requestApplicantCode = async (email: string) =>
  readJson(
    await fetch(`${publicJobsUrl()}/verification/request`, {
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
    await fetch(`${publicJobsUrl()}/verification/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    })
  );

export const submitApplication = async (jobId: string, applicantToken: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return readJson(
    await fetch(`${publicJobsUrl()}/${jobId}/apply`, {
      method: "POST",
      headers: { "X-Applicant-Token": applicantToken },
      body: form,
    })
  );
};
