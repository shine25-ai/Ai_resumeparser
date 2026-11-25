import { BASE_URL, apiFetch } from "./Api";

const PIPELINE_BASE = `${BASE_URL}/pipeline`;

async function parseApiJson<T>(res: Response, fallbackMsg: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.detail || json?.message || fallbackMsg);
  }
  return (json?.data ?? json) as T;
}

export type StageType = "active" | "hired" | "rejected" | "withdrawn";

export interface WorkflowStage {
  id: string;
  name: string;
  colour: string;
  type: StageType;
  order: number;
  requires_reason?: boolean;
  allowed_transitions: string[];
}

export interface WorkflowDocument {
  id: string;
  company_id: string;
  job_id?: string | null;
  name: string;
  is_default: boolean;
  stages: WorkflowStage[];
  created_at?: string;
  updated_at?: string;
}

export interface PipelineCard {
  id: string;
  application_id: string;
  candidate_id?: string;
  candidate_name: string;
  candidate_email?: string;
  candidate_code: string;
  job_id?: string;
  job_title?: string;
  rating?: number | null;
  skills: string[];
  days_in_stage: number;
  applied_at?: string;
  stage_id: string;
  stage_name: string;
  status_pill?: string | null;
  rejection_reason?: string | null;
  rejection_comment?: string | null;
  hired_at?: string | null;
  photo_url?: string | null;
  allowed_transitions: string[];
}

export interface PipelineColumn {
  id: string;
  name: string;
  colour: string;
  type: StageType;
  requires_reason?: boolean;
  allowed_transitions: string[];
  count: number;
  avg_days_in_stage: number;
  cards: PipelineCard[];
}

export interface PipelineKPIs {
  total_candidates: number;
  applied_this_week: number;
  screening: number;
  shortlisted: number;
  interviewing: number;
  selected: number;
  rejected: number;
  conversion_rate: number;
}

export interface PipelineFunnelItem {
  stage_id: string;
  stage_name: string;
  colour: string;
  count: number;
  percentage: number;
}

export interface StageConversionItem {
  from_stage: string;
  to_stage: string;
  from_name: string;
  to_name: string;
  rate: number;
}

export interface HiringProgress {
  target_vacancies: number;
  hired: number;
  in_process: number;
  pending: number;
}

export interface KanbanBoardData {
  workflow: WorkflowDocument;
  columns: PipelineColumn[];
  kpis: PipelineKPIs;
  funnel: PipelineFunnelItem[];
  stage_conversions: StageConversionItem[];
  hiring_progress: HiringProgress;
  selected_job?: {
    id: string;
    title: string;
    target_vacancies: number;
    hired: number;
  } | null;
}

export interface ApplicationHistoryItem {
  id: string;
  company_id: string;
  application_id: string;
  job_id?: string;
  from_stage: string;
  from_stage_name: string;
  to_stage: string;
  to_stage_name: string;
  action: string;
  by: string;
  by_name: string;
  at: string;
  reason?: string | null;
  comment?: string | null;
}

export async function getWorkflowApi(jobId?: string): Promise<WorkflowDocument> {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
  const res = await apiFetch(`${PIPELINE_BASE}/workflows${query}`);
  return parseApiJson<WorkflowDocument>(res, "Failed to fetch workflow");
}

export async function saveWorkflowApi(payload: {
  id?: string;
  job_id?: string | null;
  name?: string;
  is_default?: boolean;
  stages: WorkflowStage[];
}): Promise<WorkflowDocument> {
  const res = await apiFetch(`${PIPELINE_BASE}/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseApiJson<WorkflowDocument>(res, "Failed to save workflow");
}

export async function deleteWorkflowStageApi(
  workflowId: string,
  stageId: string,
  reassignToStageId?: string
): Promise<{ success: boolean; reassigned_count: number }> {
  const query = reassignToStageId ? `?reassign_to_stage_id=${encodeURIComponent(reassignToStageId)}` : "";
  const res = await apiFetch(
    `${PIPELINE_BASE}/workflows/${encodeURIComponent(workflowId)}/stages/${encodeURIComponent(stageId)}${query}`,
    {
      method: "DELETE",
    }
  );
  return parseApiJson<{ success: boolean; reassigned_count: number }>(res, "Failed to delete stage");
}

export async function getKanbanBoardApi(params?: {
  job_id?: string;
  recruiter_id?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort_by?: string;
}): Promise<KanbanBoardData> {
  const query = new URLSearchParams();
  if (params?.job_id) query.set("job_id", params.job_id);
  if (params?.recruiter_id) query.set("recruiter_id", params.recruiter_id);
  if (params?.source) query.set("source", params.source);
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.search) query.set("search", params.search);
  if (params?.sort_by) query.set("sort_by", params.sort_by);

  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`${PIPELINE_BASE}/kanban${qs}`);
  return parseApiJson<KanbanBoardData>(res, "Failed to fetch recruitment pipeline");
}

export async function moveCandidateStageApi(
  applicationId: string,
  body: {
    to_stage_id: string;
    reason?: string;
    comment?: string;
  }
): Promise<any> {
  const res = await apiFetch(`${PIPELINE_BASE}/applications/${encodeURIComponent(applicationId)}/stage`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseApiJson<any>(res, "Failed to move candidate stage");
}

export async function bulkMoveCandidatesApi(body: {
  application_ids: string[];
  to_stage_id: string;
  reason?: string;
  comment?: string;
}): Promise<{ moved_count: number; errors: any[] }> {
  const res = await apiFetch(`${PIPELINE_BASE}/applications/bulk-move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseApiJson<{ moved_count: number; errors: any[] }>(res, "Failed to bulk move candidates");
}

export async function getApplicationHistoryApi(applicationId: string): Promise<ApplicationHistoryItem[]> {
  const res = await apiFetch(`${PIPELINE_BASE}/applications/${encodeURIComponent(applicationId)}/history`);
  return parseApiJson<ApplicationHistoryItem[]>(res, "Failed to fetch candidate stage history");
}
