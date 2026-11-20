import { BASE_URL, apiFetch } from './Api';

const ATS_BASE = `${BASE_URL}/ats`;
const PUBLIC_TRACK_BASE = `${BASE_URL}/public/track`;

async function parseApiJson<T>(res: Response, fallbackMsg: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.detail || json?.message || fallbackMsg);
  }
  return (json?.data ?? json) as T;
}

export interface KanbanCandidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  location: string;
  experience_years?: number | null;
  skills: string[];
  ai_score?: number | null;
  stage: string;
  tags: string[];
  notes_count: number;
  avg_scorecard?: number | null;
  tracking_token: string;
  upload_date: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface KanbanBoardResponse {
  stages: string[];
  candidates: KanbanCandidate[];
  team: TeamMember[];
}

export interface CandidateNote {
  id: string;
  text: string;
  mentions: string[];
  author: string;
  created_at: string;
}

export interface CollaborationData {
  candidate_id: string;
  tags: string[];
  notes: CandidateNote[];
  tracking_token: string;
}

export interface DuplicateGroup {
  id: string;
  reason: string;
  candidates: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    experience_years?: number | null;
    skills: string[];
    upload_date: string;
  }[];
}

export interface ScorecardItem {
  id: string;
  candidate_id: string;
  candidate_name: string;
  role: string;
  technical: number;
  communication: number;
  culture_fit: number;
  overall: number;
  recommendation: string;
  notes: string;
  evaluator: string;
  created_at: string;
}

export interface OfferItem {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  role: string;
  department: string;
  ctc: string;
  joining_date: string;
  location: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'DECLINED';
  created_by: string;
  approved_by?: string | null;
  approval_note?: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface OnboardingRecord {
  candidate_id: string;
  candidate_name: string;
  role: string;
  stage: string;
  joined: boolean;
  progress_pct: number;
  items: OnboardingChecklistItem[];
  updated_at?: string | null;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  trigger: string;
  channel: 'email' | 'whatsapp' | 'both' | string;
  enabled: boolean;
  subject: string;
  email_body: string;
  whatsapp_body: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  user: string;
  target: string;
  details: string;
  created_at: string;
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  users: string[];
  actions: string[];
}

export interface PublicTrackStatus {
  candidate_first_name: string;
  role: string;
  company: string;
  current_stage: string;
  applied_at: string;
  last_updated: string;
  next_interview: { date: string; time: string } | null;
}

export const fetchKanbanBoard = async () =>
  parseApiJson<KanbanBoardResponse>(await apiFetch(`${ATS_BASE}/kanban`), 'Failed to load Kanban board');

export const moveCandidateStage = async (candidateId: string, stage: string) =>
  parseApiJson(
    await apiFetch(`${ATS_BASE}/candidates/${encodeURIComponent(candidateId)}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    }),
    'Failed to move candidate'
  );

export const runBulkCandidateAction = async (
  candidateIds: string[],
  action: 'shortlist' | 'reject' | 'offer'
) =>
  parseApiJson<{ updated: number; action: string }>(
    await apiFetch(`${ATS_BASE}/candidates/bulk-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: candidateIds, action }),
    }),
    'Bulk action failed'
  );

export const fetchCandidateCollaboration = async (candidateId: string) =>
  parseApiJson<CollaborationData>(
    await apiFetch(`${ATS_BASE}/candidates/${encodeURIComponent(candidateId)}/collaboration`),
    'Failed to load tags & notes'
  );

export const saveCandidateTags = async (candidateId: string, tags: string[]) =>
  parseApiJson<{ candidate_id: string; tags: string[] }>(
    await apiFetch(`${ATS_BASE}/candidates/${encodeURIComponent(candidateId)}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    }),
    'Failed to update tags'
  );

export const postCandidateNote = async (candidateId: string, text: string, mentions: string[]) =>
  parseApiJson<CandidateNote>(
    await apiFetch(`${ATS_BASE}/candidates/${encodeURIComponent(candidateId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mentions }),
    }),
    'Failed to save note'
  );

export const fetchDuplicates = async () =>
  parseApiJson<DuplicateGroup[]>(await apiFetch(`${ATS_BASE}/duplicates`), 'Failed to scan duplicates');

export const mergeDuplicateProfiles = async (primaryId: string, secondaryId: string) =>
  parseApiJson(
    await apiFetch(`${ATS_BASE}/duplicates/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primary_id: primaryId, secondary_id: secondaryId }),
    }),
    'Failed to merge duplicates'
  );

export const fetchScorecards = async () =>
  parseApiJson<ScorecardItem[]>(await apiFetch(`${ATS_BASE}/scorecards`), 'Failed to load scorecards');

export const submitScorecard = async (payload: Omit<ScorecardItem, 'id' | 'overall' | 'evaluator' | 'created_at'>) =>
  parseApiJson<ScorecardItem>(
    await apiFetch(`${ATS_BASE}/scorecards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    'Failed to save scorecard'
  );

export const fetchOffers = async () =>
  parseApiJson<OfferItem[]>(await apiFetch(`${ATS_BASE}/offers`), 'Failed to load offers');

export const createOffer = async (payload: {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  role: string;
  department: string;
  ctc: string;
  joining_date: string;
  location: string;
}) =>
  parseApiJson<OfferItem>(
    await apiFetch(`${ATS_BASE}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    'Failed to create offer'
  );

export const updateOfferStatus = async (offerId: string, status: string, note = '') =>
  parseApiJson<OfferItem>(
    await apiFetch(`${ATS_BASE}/offers/${encodeURIComponent(offerId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    }),
    'Failed to update offer status'
  );

export const fetchOnboardingList = async () =>
  parseApiJson<OnboardingRecord[]>(await apiFetch(`${ATS_BASE}/onboarding`), 'Failed to load onboarding');

export const saveOnboardingChecklist = async (
  candidateId: string,
  items: OnboardingChecklistItem[],
  joined: boolean
) =>
  parseApiJson(
    await apiFetch(`${ATS_BASE}/onboarding/${encodeURIComponent(candidateId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, joined }),
    }),
    'Failed to save onboarding checklist'
  );

export const fetchAutomationTemplates = async () =>
  parseApiJson<AutomationTemplate[]>(
    await apiFetch(`${ATS_BASE}/automation-templates`),
    'Failed to load automation templates'
  );

export const saveAutomationTemplate = async (template: AutomationTemplate) =>
  parseApiJson<AutomationTemplate>(
    await apiFetch(`${ATS_BASE}/automation-templates/${encodeURIComponent(template.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    }),
    'Failed to save template'
  );

export const createCandidateTrackingLink = async (candidateId: string) =>
  parseApiJson<{ candidate_id: string; token: string; path: string }>(
    await apiFetch(`${ATS_BASE}/candidates/${encodeURIComponent(candidateId)}/tracking-link`, {
      method: 'POST',
    }),
    'Failed to generate tracking link'
  );

export const fetchPublicTrackingStatus = async (token: string) => {
  const res = await fetch(`${PUBLIC_TRACK_BASE}/${encodeURIComponent(token)}`);
  return parseApiJson<PublicTrackStatus>(res, 'Status link not found');
};

export const fetchAuditLogs = async (params: {
  user?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}) => {
  const q = new URLSearchParams();
  if (params.user) q.set('user', params.user);
  if (params.action) q.set('action', params.action);
  if (params.start_date) q.set('start_date', params.start_date);
  if (params.end_date) q.set('end_date', params.end_date);
  if (params.search) q.set('search', params.search);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return parseApiJson<AuditLogResponse>(
    await apiFetch(`${ATS_BASE}/audit-logs${qs}`),
    'Failed to load audit logs'
  );
};

