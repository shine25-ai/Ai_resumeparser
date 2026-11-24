import { apiFetch, BASE_URL } from "./Api";

/** Calls for the Interviews screens (Phase 8): panels, evaluation forms, evaluations and conflicts. */

export const PANELS_URL = `${BASE_URL}/interview-panels`;
export const FORMS_URL = `${BASE_URL}/evaluation-forms`;
export const INTERVIEWS_API = `${BASE_URL}/interviews`;

export type PanelStatus = "ACTIVE" | "INACTIVE";

export interface PanelMember {
  user_id: string;
  name: string;
  email?: string | null;
  role: "lead" | "member";
}

export type Availability = "INDIVIDUAL" | "COMMON" | "ON_REQUEST";

/** One weekly window for common availability. weekday: Monday = 0. Times are HH:MM in the company timezone. */
export interface AvailabilityWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface InterviewPanel {
  id: string;
  name: string;
  code?: string | null;
  description?: string;
  status: PanelStatus;
  availability?: Availability;
  weekly_availability?: AvailabilityWindow[];
  members: PanelMember[];
  expertise_tags: string[];
  job_ids: string[];
  rounds: number[];
}

export interface PanelPayload {
  name: string;
  code?: string | null;
  description?: string;
  status: PanelStatus;
  availability: Availability;
  weekly_availability?: AvailabilityWindow[];
  members: PanelMember[];
  expertise_tags: string[];
  job_ids: string[];
  rounds: number[];
}

export type Recommendation = "NEXT_ROUND" | "SELECT" | "HOLD" | "REJECT";

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  NEXT_ROUND: "Move to Next Round",
  SELECT: "Select for Hiring",
  HOLD: "Keep on Hold",
  REJECT: "Reject",
};

export interface EvaluationCriterion {
  id: string;
  label: string;
  weight: number;
}

export interface EvaluationForm {
  id: string;
  name: string;
  job_id?: string | null;
  round_number?: number | null;
  scale_max: number;
  criteria: EvaluationCriterion[];
}

export interface PanelEvaluation {
  id: string;
  interviewer_user_id: string;
  interviewer_name: string;
  status: "DRAFT" | "SUBMITTED";
  ratings: Record<string, number>;
  comments?: string | null;
  recommendation?: Recommendation | null;
  score?: number | null;
  submitted_at?: string | null;
  audit?: { action: string; at: string; reason?: string }[];
}

export interface PanelSummary {
  submitted_count: number;
  assigned_count: number;
  label: string;
  score: number | null;
  is_complete: boolean;
}

export interface PanelView {
  interview_id: string;
  assigned_count: number;
  summary: PanelSummary;
  evaluations: PanelEvaluation[];
  can_evaluate: boolean;
}

/** The seven competencies on Screen 12, in order. Weights add up to 100. */
export const DEFAULT_CRITERIA: EvaluationCriterion[] = [
  { id: "code_technical", label: "Code & Technical Skills", weight: 30 },
  { id: "system_design", label: "System Design & Architecture", weight: 20 },
  { id: "problem_solving", label: "Problem Solving & Analytical Thinking", weight: 15 },
  { id: "communication", label: "Communication & Collaboration", weight: 10 },
  { id: "ownership", label: "Ownership & Attitude", weight: 10 },
  { id: "culture_fit", label: "Cultural Fit & Role Alignment", weight: 10 },
  { id: "overall", label: "Overall Recommendation", weight: 5 },
];

const authJson = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const readJson = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail ?? data?.message;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status})`);
  }
  return data?.data ?? data;
};

export const listPanels = async (): Promise<InterviewPanel[]> =>
  readJson(await apiFetch(PANELS_URL));

export const createPanel = async (payload: PanelPayload): Promise<InterviewPanel> =>
  readJson(await apiFetch(PANELS_URL, authJson("POST", payload)));

export const updatePanel = async (id: string, payload: PanelPayload): Promise<InterviewPanel> =>
  readJson(await apiFetch(`${PANELS_URL}/${id}`, authJson("PUT", payload)));

export const deletePanel = async (id: string) =>
  readJson(await apiFetch(`${PANELS_URL}/${id}`, { method: "DELETE" }));

export const listEvaluationForms = async (): Promise<EvaluationForm[]> =>
  readJson(await apiFetch(FORMS_URL));

export const createEvaluationForm = async (payload: {
  name: string;
  scale_max: number;
  criteria: EvaluationCriterion[];
  job_id?: string | null;
  round_number?: number | null;
}): Promise<EvaluationForm> => readJson(await apiFetch(FORMS_URL, authJson("POST", payload)));

export const getPanelView = async (interviewId: string): Promise<PanelView> =>
  readJson(await apiFetch(`${INTERVIEWS_API}/${interviewId}/evaluations`));

export const saveMyEvaluation = async (
  interviewId: string,
  payload: { ratings: Record<string, number>; comments?: string; recommendation?: Recommendation | null; submit: boolean },
): Promise<PanelEvaluation> => readJson(await apiFetch(`${INTERVIEWS_API}/${interviewId}/evaluations/me`, authJson("PUT", payload)));

export const checkPanelConflicts = async (payload: {
  interviewer_ids: string[];
  scheduled_date: string;
  scheduled_time: string;
  timezone?: string;
  duration_minutes?: number;
  exclude_interview_id?: string | null;
}): Promise<{ has_conflict: boolean; conflicts: { interview_id: string; candidate_name: string }[] }> =>
  readJson(await apiFetch(`${PANELS_URL}/check-conflicts`, authJson("POST", payload)));

/** Star-style rating (1 to 5) turned into the weighted contribution shown in the table. */
export const weightedContribution = (rating: number | undefined, weight: number): number =>
  rating ? (rating * weight) / 100 : 0;

/** Total on the 1 to 5 scale, matching the backend's weighted average when weights add to 100. */
export const weightedTotal = (criteria: EvaluationCriterion[], ratings: Record<string, number>): number =>
  Math.round(criteria.reduce((sum, c) => sum + weightedContribution(ratings[c.id], c.weight), 0) * 100) / 100;

/** The band shown next to the score (labels are ours; the mockup shows "Strong Fit" at 84%). */
export const fitLabel = (percent: number): string => {
  if (percent >= 80) return "Strong Fit";
  if (percent >= 60) return "Good Fit";
  if (percent >= 40) return "Partial Fit";
  return "Weak Fit";
};
