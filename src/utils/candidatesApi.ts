import { BASE_URL, apiFetch } from "./Api";
import { readJson } from "../careers/api";
import type { Confidence } from "./applicationsApi";
import type { JobMatch } from "../components/JobMatchBadge";

const URL_ = `${BASE_URL}/candidates`;

const read = async <T>(res: Response): Promise<T> => (await readJson(res)) as T;

export interface CandidateItem {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  normalized_email?: string;
  phone?: string;
  normalized_phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  total_experience_years?: number | null;
  current_role?: string;
  skills?: string[];
  tags?: string[];
  owner_id?: string | null;
  owner_name?: string | null;
  status: "active" | "archived" | "merged";
  source?: string;
  stage?: string;
  candidate_id_display?: string | null;
  applications?: any[];
  latest_application?: any;
  created_at: string;
  updated_at: string;
  merged_into?: string | null;
}

export interface CandidateSummaryStats {
  total_candidates: number;
  active_pipeline: number;
  hired: number;
  possible_duplicates: number;
}

export interface DuplicateGroup {
  id: string;
  match_type: string;
  matched_value: string;
  reason: string;
  candidates: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    current_role: string;
    total_experience_years?: number | null;
    skills: string[];
    created_at: string;
  }[];
}

export interface Candidate360Data extends CandidateItem {
  documents: {
    id: string;
    candidate_id: string;
    original_filename: string;
    filename: string;
    file_path?: string;
    s3_url?: string;
    status: string;
    confidence?: Confidence;
    parsed_data?: Record<string, any>;
    ai_evaluation?: Record<string, any>;
    upload_date?: string;
  }[];
  applications: {
    id: string;
    opening_id: string;
    opening_title: string;
    applicant_email: string;
    stage: string;
    stage_id?: string;
    stage_name?: string;
    match?: JobMatch | null;
    source: string;
    submitted_at: string;
    form?: Record<string, any>;
    extracted?: Record<string, any>;
    history?: { at: string; action: string; by?: string; note?: string }[];
  }[];
  interviews: {
    id: string;
    round_name?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    interviewer_name?: string;
    status?: string;
    recommendation?: string;
    feedback?: string;
  }[];
  notes: {
    id: string;
    text: string;
    author_id?: string;
    author_name?: string;
    author_email?: string;
    mentions?: string[];
    created_at: string;
  }[];
  activity: {
    id: string;
    action: string;
    details?: string;
    actor_name?: string;
    created_at: string;
  }[];
}

export interface CandidateQueryParams {
  q?: string;
  job_id?: string;
  stage?: string;
  source?: string;
  location?: string;
  min_experience?: number;
  max_experience?: number;
  tags?: string[];
  owner_id?: string;
  date_from?: string;
  date_to?: string;
  sort?: "latest" | "oldest" | "experience_desc" | "experience_asc" | "name";
  page?: number;
  limit?: number;
}

export const fetchCandidates = async (params: CandidateQueryParams = {}) => {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.job_id) q.set("job_id", params.job_id);
  if (params.stage && params.stage !== "All") q.set("stage", params.stage);
  if (params.source) q.set("source", params.source);
  if (params.location) q.set("location", params.location);
  if (params.min_experience != null) q.set("min_experience", String(params.min_experience));
  if (params.max_experience != null) q.set("max_experience", String(params.max_experience));
  if (params.tags?.length) {
    params.tags.forEach((t) => q.append("tags", t));
  }
  if (params.owner_id) q.set("owner_id", params.owner_id);
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  if (params.sort) q.set("sort", params.sort);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));

  const res = await apiFetch(`${URL_}?${q.toString()}`);
  return read<{ items: CandidateItem[]; total: number; page: number; limit: number; total_pages: number }>(res);
};

export const fetchCandidateStats = async () => {
  const res = await apiFetch(`${URL_}/summary-stats`);
  return read<CandidateSummaryStats>(res);
};

export const fetchCandidate360 = async (id: string) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(id)}`);
  return read<Candidate360Data>(res);
};

export const updateCandidate = async (id: string, payload: Partial<CandidateItem>) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return read<Candidate360Data>(res);
};

export const updateCandidateTags = async (id: string, tags: string[]) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(id)}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tags }),
  });
  return read<{ candidate_id: string; tags: string[] }>(res);
};

export const addCandidateNote = async (id: string, text: string, mentions: string[] = []) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(id)}/notes`, {
    method: "POST",
    body: JSON.stringify({ text, mentions }),
  });
  return read<Candidate360Data["notes"][0]>(res);
};

export const removeCandidateNote = async (candidateId: string, noteId: string) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(candidateId)}/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
  return read<{ success: boolean }>(res);
};

export const fetchDuplicateCandidates = async () => {
  const res = await apiFetch(`${URL_}/duplicates`);
  return read<DuplicateGroup[]>(res);
};

export const mergeCandidatesApi = async (primaryId: string, secondaryId: string) => {
  const res = await apiFetch(`${URL_}/merge`, {
    method: "POST",
    body: JSON.stringify({ primary_id: primaryId, secondary_id: secondaryId }),
  });
  return read<{ primary_id: string; secondary_id: string; merged_skills_count: number; merged_tags_count: number }>(res);
};

export const bulkCandidateAction = async (candidateIds: string[], action: "add_tags" | "remove_tags" | "assign_owner" | "update_status", value: any) => {
  const res = await apiFetch(`${URL_}/bulk-action`, {
    method: "POST",
    body: JSON.stringify({ candidate_ids: candidateIds, action, value }),
  });
  return read<{ action: string; updated: number }>(res);
};

export const exportCandidatesCsv = async (params: CandidateQueryParams = {}) => {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.job_id) q.set("job_id", params.job_id);
  if (params.stage && params.stage !== "All") q.set("stage", params.stage);
  if (params.source) q.set("source", params.source);
  if (params.location) q.set("location", params.location);
  if (params.min_experience != null) q.set("min_experience", String(params.min_experience));
  if (params.max_experience != null) q.set("max_experience", String(params.max_experience));
  if (params.tags?.length) {
    params.tags.forEach((t) => q.append("tags", t));
  }
  if (params.owner_id) q.set("owner_id", params.owner_id);

  const res = await apiFetch(`${URL_}/export?${q.toString()}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `candidates_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const reprocessCandidateResume = async (id: string) => {
  const res = await apiFetch(`${URL_}/${encodeURIComponent(id)}/reprocess`, {
    method: "POST",
  });
  return read<{ success: boolean; message: string }>(res);
};
