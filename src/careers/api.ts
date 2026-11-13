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

/** Page address of a company in the resume portal, e.g. "acme". Empty shows the default company. */
const companyQuery = (company?: string) => {
  const slug = (company || "").trim().toLowerCase();
  return slug ? `?company=${encodeURIComponent(slug)}` : "";
};

export interface PublicCompany {
  id: string;
  name: string;
  slug: string;
}

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
  /** Whose careers page this is. Sent by the public page endpoint only. */
  company?: PublicCompany;
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
  success_title: "Thank you! Your resume has been submitted successfully.",
  success_message: "We have received your details and resume. You will receive updates about relevant job opportunities through your registered email address.",
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

export const fetchPublicJobs = async (company?: string): Promise<PublicJob[]> =>
  ((await readJson(await fetch(`${publicJobsUrl()}${companyQuery(company)}`))) as PublicJob[]).map(normalizeJob);

export const fetchPageSettings = async (company?: string): Promise<CareersPageSettings> => ({
  ...DEFAULT_PAGE_SETTINGS,
  ...(await readJson(await fetch(`${publicJobsUrl()}/page${companyQuery(company)}`))),
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

/** Choices for "How did you hear about this role?" on the apply form. */
export const heardFromOptions = (companyName = "Shinelogics") => [
  "LinkedIn",
  "Job portal (Naukri, Indeed, etc.)",
  `${companyName} website`,
  "Referred by a friend or employee",
  "Social media",
  "College or campus drive",
  "Other",
];
export const HEARD_FROM_OPTIONS = heardFromOptions();

export const submitApplication = async (
  jobId: string,
  applicantToken: string,
  file: File,
  details: { heardFrom?: string; note?: string } = {}
) => {
  const form = new FormData();
  form.append("file", file);
  if (details.heardFrom) form.append("heard_from", details.heardFrom);
  if (details.note?.trim()) form.append("note", details.note.trim());
  return readJson(
    await fetch(`${publicJobsUrl()}/${jobId}/apply`, {
      method: "POST",
      headers: { "X-Applicant-Token": applicantToken },
      body: form,
    })
  );
};
