import { apiFetch } from "./Api";
import { readJson } from "../careers/api";

const read = async <T,>(res: Response): Promise<T> => (await readJson(res)) as T;

export interface CandidateSkill {
  id: string;
  candidate_id: string;
  skill_name: string;
  raw_name?: string;
  proficiency: number;
  sources: string[];
  years_experience?: number | null;
  last_used?: string | null;
  verified: boolean;
  confidence: number;
  skill_class: "primary" | "secondary";
  explanation: string;
  created_at?: string;
  updated_at?: string;
}

export interface SkillWeights {
  interview_weight: number;
  resume_weight: number;
}

export interface JobSkillMatch {
  candidate_id: string;
  job_id: string;
  job_title: string;
  overall_match_pct: number;
  primary_match_pct: number;
  secondary_match_pct: number;
  matched_primary: CandidateSkill[];
  missing_primary: string[];
  matched_secondary: CandidateSkill[];
  missing_secondary: string[];
  gaps: string[];
  summary_label: string;
}

export interface SkillMatrixAnalytics {
  top_demanded: { skill: string; job_count: number }[];
  talent_pool: { skill: string; candidate_count: number; avg_proficiency: number }[];
  matrix_rows: {
    candidate_id: string;
    candidate_name: string;
    role: string;
    experience: number;
    primary_skills: string[];
    skills: Record<string, number>;
  }[];
}

// ── API Functions ───────────────────────────────────────────────────────────

export async function fetchSkillWeights(): Promise<SkillWeights> {
  const res = await apiFetch("/api/v1/skills/weights");
  return read<SkillWeights>(res);
}

export async function updateSkillWeights(weights: SkillWeights): Promise<SkillWeights> {
  const res = await apiFetch("/api/v1/skills/weights", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(weights),
  });
  return read<SkillWeights>(res);
}

export async function fetchCandidateSkills(candidateId: string): Promise<CandidateSkill[]> {
  const res = await apiFetch(`/api/v1/skills/candidate/${candidateId}`);
  return read<CandidateSkill[]>(res);
}

export async function recalculateCandidateSkills(candidateId: string): Promise<CandidateSkill[]> {
  const res = await apiFetch(`/api/v1/skills/candidate/${candidateId}/recalculate`, {
    method: "POST",
  });
  return read<CandidateSkill[]>(res);
}

export async function editCandidateSkill(
  candidateId: string,
  skillName: string,
  payload: { proficiency: number; skill_class?: string; years_experience?: number; last_used?: string }
): Promise<CandidateSkill> {
  const res = await apiFetch(`/api/v1/skills/candidate/${candidateId}/${encodeURIComponent(skillName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return read<CandidateSkill>(res);
}

export async function fetchJobSkillMatch(candidateId: string, jobId: string): Promise<JobSkillMatch> {
  const res = await apiFetch(`/api/v1/skills/match?candidate_id=${encodeURIComponent(candidateId)}&job_id=${encodeURIComponent(jobId)}`);
  return read<JobSkillMatch>(res);
}

export async function fetchSkillMatrixAnalytics(jobId?: string): Promise<SkillMatrixAnalytics> {
  const qs = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
  const res = await apiFetch(`/api/v1/skills/matrix${qs}`);
  return read<SkillMatrixAnalytics>(res);
}

export async function mergeDuplicateSkills(sourceSkill: string, targetSkill: string): Promise<{ status: string; updated_candidate_skills: number }> {
  const res = await apiFetch("/api/v1/skills/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_skill: sourceSkill, target_skill: targetSkill }),
  });
  return read<{ status: string; updated_candidate_skills: number }>(res);
}
