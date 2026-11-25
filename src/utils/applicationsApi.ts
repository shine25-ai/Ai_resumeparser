import { BASE_URL, apiFetch } from "./Api";
import { readJson, type ApplicationForm } from "../careers/api";

/** Applications, staff side (Phase 5): list, one application, review, corrections, read the resume again. */

const URL_ = `${BASE_URL}/applications`;

export interface Confidence {
  score?: number;
  level?: "high" | "medium" | "low";
  fields?: Record<string, boolean>;
  email_matches?: boolean;
}

export interface ApplicationRow {
  id: string;
  opening_id: string;
  opening_title: string;
  applicant_email: string;
  submitted_at: string;
  full_name: string | null;
  phone: string | null;
  location: string;
  total_experience_years: number | null;
  notice_period: string;
  expected_ctc: number | null;
  stage: string;
  source: string;
  heard_from: string | null;
  note: string | null;
  review_status: "pending" | "reviewed";
  confidence: Confidence;
  resume_id: string;
  /** The candidate record (Phase 6); null for applications sent before it. */
  candidate_id: string | null;
  /** The resume's CND code, for display. */
  candidate_code: string | null;
  resume_status: string;
  /** false for applications sent before the 5-step form (resume only). */
  full_form: boolean;
}

export interface ComparisonRow {
  field: string;
  label: string;
  entered: unknown;
  extracted: unknown;
  same: boolean;
  missing_from_resume: boolean;
}

export interface ApplicationDetail extends ApplicationRow {
  form: Partial<ApplicationForm>;
  extracted: Partial<ApplicationForm>;
  comparison: ComparisonRow[];
  consent: { accepted?: boolean; text?: string; version?: string; at?: string; ip?: string };
  review: { status: string; by?: string; at?: string; note?: string };
  history: { at: string; action: string; by?: string; note?: string }[];
  linked_existing_profile: boolean;
  resume: { id: string; status: string; s3_url: string | null; filename: string | null; candidate_id: string | null } | null;
}

export const fetchApplications = async (
  f: { job_id?: string; review?: "" | "pending" | "reviewed"; q?: string; page?: number; limit?: number } = {}
): Promise<{ items: ApplicationRow[]; total: number; page: number; limit: number }> => {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
  return readJson(await apiFetch(`${URL_}?${p}`));
};

export const fetchApplication = async (id: string): Promise<ApplicationDetail> => readJson(await apiFetch(`${URL_}/${id}`));

const post = async (path: string, body?: unknown) =>
  readJson(await apiFetch(`${URL_}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));

export const setApplicationReview = (id: string, status: "pending" | "reviewed", note = ""): Promise<ApplicationDetail> => post(`${id}/review`, { status, note });
export const applyApplicationCorrections = (id: string, fields: string[]): Promise<ApplicationDetail> => post(`${id}/apply-corrections`, { fields });
export const reprocessApplication = (id: string): Promise<ApplicationDetail> => post(`${id}/reprocess`);
