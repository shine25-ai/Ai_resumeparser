import { apiFetch } from "./Api";
import { readJson } from "../careers/api";

const read = async <T,>(res: Response): Promise<T> => (await readJson(res)) as T;

export interface PanelMember {
  user_id: string;
  name: string;
  email: string;
  role: "lead" | "member";
  avatar?: string;
}

export interface WeeklyAvailability {
  day: string;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface InterviewPanel {
  id: string;
  company_id?: string;
  name: string;
  description?: string;
  expertise_tags: string[];
  members: PanelMember[];
  assigned_jobs?: { job_id: string; job_title: string }[];
  assigned_rounds?: string[];
  weekly_availability?: WeeklyAvailability[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EvaluationCriterion {
  id?: string;
  name: string;
  description?: string;
  weight: number;
  scale_min: number;
  scale_max: number;
  category: string;
}

export interface EvaluationForm {
  id: string;
  company_id?: string;
  name: string;
  description?: string;
  job_id?: string | null;
  job_title?: string | null;
  round_name?: string | null;
  criteria: EvaluationCriterion[];
  is_default: boolean;
}

export interface CriterionRating {
  criterion_id: string;
  criterion_name: string;
  rating: number;
  weight?: number;
  comments?: string;
}

export interface InterviewEvaluation {
  id: string;
  company_id?: string;
  interview_id: string;
  application_id?: string;
  candidate_id?: string;
  job_id?: string;
  round_name?: string;
  round_number?: number;
  interviewer_id: string;
  interviewer_name: string;
  interviewer_email: string;
  status: "draft" | "submitted";
  is_locked: boolean;
  ratings: CriterionRating[];
  calculated_score: number;
  recommendation?: "strong_hire" | "hire" | "no_hire" | "strong_no_hire" | string;
  strengths?: string[];
  areas_for_improvement?: string[];
  general_notes?: string;
  submitted_at?: string;
  reopened_at?: string;
  reopened_by?: string;
}

export interface InterviewEvaluationsSummary {
  interview_id: string;
  total_assigned: number;
  submitted_count: number;
  progress_label: string;
  is_complete: boolean;
  overall_score: number;
  recommendation_counts: Record<string, number>;
  evaluations: InterviewEvaluation[];
}

// ── API Helpers ─────────────────────────────────────────────────────────────

export async function fetchInterviewPanels(params?: { q?: string; job_id?: string; round_name?: string }): Promise<InterviewPanel[]> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.job_id) query.set("job_id", params.job_id);
  if (params?.round_name) query.set("round_name", params.round_name);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`/api/v1/interview-panels${qs}`);
  return read<InterviewPanel[]>(res);
}

export async function createInterviewPanel(data: Partial<InterviewPanel>): Promise<InterviewPanel> {
  const res = await apiFetch("/api/v1/interview-panels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return read<InterviewPanel>(res);
}

export async function updateInterviewPanel(id: string, data: Partial<InterviewPanel>): Promise<InterviewPanel> {
  const res = await apiFetch(`/api/v1/interview-panels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return read<InterviewPanel>(res);
}

export async function deleteInterviewPanel(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`/api/v1/interview-panels/${id}`, {
    method: "DELETE",
  });
  return read<{ success: boolean }>(res);
}

export async function fetchEvaluationSummary(interviewId: string): Promise<InterviewEvaluationsSummary> {
  const res = await apiFetch(`/api/v1/evaluations/interview/${interviewId}/summary`);
  return read<InterviewEvaluationsSummary>(res);
}

export async function fetchMyEvaluation(interviewId: string, jobId?: string, roundName?: string): Promise<InterviewEvaluation> {
  const query = new URLSearchParams();
  if (jobId) query.set("job_id", jobId);
  if (roundName) query.set("round_name", roundName);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`/api/v1/evaluations/interview/${interviewId}/my-evaluation${qs}`);
  return read<InterviewEvaluation>(res);
}

export async function submitEvaluation(interviewId: string, payload: Partial<InterviewEvaluation>): Promise<InterviewEvaluation> {
  const res = await apiFetch(`/api/v1/evaluations/interview/${interviewId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return read<InterviewEvaluation>(res);
}

export async function reopenEvaluation(evaluationId: string, reason?: string): Promise<InterviewEvaluation> {
  const res = await apiFetch(`/api/v1/evaluations/${evaluationId}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || "Reopened by admin for corrections" }),
  });
  return read<InterviewEvaluation>(res);
}

