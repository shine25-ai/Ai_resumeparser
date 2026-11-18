export type IntakeWindow = 'today' | '24h' | '7d';

export type TrendDirection = 'up' | 'down' | 'flat';

export interface DashboardStatItem {
  key?: string;
  label: string;
  value: string;
  change: string;
  changeColor: string;
  subtitle?: string;
  tooltip?: string;
  trend_direction?: TrendDirection;
  trend_percent?: number | null;
  trend_delta?: number | null;
  trend_label?: string;
}

export interface DashboardPipelineItem {
  stage: string;
  count: string;
  width: string;
  bg: string;
  conversion_from_prev_percent?: number | null;
}

export interface DashboardStatusItem {
  name: string;
  percentage: string;
  count: number;
  color: string;
}

export interface DashboardActivityItem {
  title: string;
  time: string;
  icon_type: string;
  bg: string;
  action?: string | null;
  email?: string | null;
  details?: string | null;
}

export interface DashboardUpcomingInterviewItem {
  id?: string | null;
  time: string;
  role: string;
  candidate: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  candidate_id?: string | null;
  status?: string | null;
}

export type DateRangePreset = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardFilters {
  dateRange: DateRangePreset;
  startDate: string;
  endDate: string;
}

export interface DashboardNotification {
  id: string;
  type: 'stuck' | 'interview' | 'application' | 'parse' | 'feedback' | string;
  severity: 'danger' | 'warning' | 'info' | 'success' | string;
  title: string;
  description: string;
  time: string;
  actionPath: string;
}

// ── Executive Dashboard Insights ─────────────────────────────────────────────

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  severity: 'danger' | 'warning' | 'info' | 'clear';
  actionPath: string;
}

export interface TodayInterviewItem {
  id: string;
  candidate: string;
  candidate_id: string;
  role: string;
  interviewer: string;
  time: string;
  date: string;
  status: string;
  meeting_link?: string;
}

export interface TrendPoint {
  label: string;
  resumes: number;
  applications: number;
}

export interface ApplicationsTrendData {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  monthly: TrendPoint[];
}

export interface SourceOfHireItem {
  source: string;
  candidates: number;
  interviewed: number;
  selected: number;
  conversion_rate: number;
  breakdown?: { name: string; count: number }[];
}

export interface MatchedCandidateBrief {
  id: string;
  name: string;
  role: string;
  match_pct: number;
  matched_skills: string[];
  stage: string;
  applied?: boolean;
}

export interface OpenJobHealthItem {
  id: string;
  title: string;
  department: string;
  applicants: number;
  shortlisted: number;
  interviewed: number;
  days_open: number;
  health: 'healthy' | 'low_applicants' | 'open_too_long';
  top_matches: MatchedCandidateBrief[];
}

export interface SkillGapItem {
  skill: string;
  demand_jobs: number;
  supply_candidates: number;
  coverage_pct: number;
  gap_severity: 'high' | 'medium' | 'covered';
}

export interface ParsingQualityData {
  total_resumes: number;
  parse_success_rate: number;
  avg_confidence_score: number;
  failed_count: number;
  missing_fields: { field: string; count: number; percent: number }[];
}

export interface CandidateExtrasData {
  locations: { label: string; count: number; percent: number }[];
  notice_periods: { label: string; count: number; percent: number }[];
  ctc_bands: { band: string; current_count: number; expected_count: number }[];
  ctc_has_real_data: boolean;
}

export interface InterviewerWorkloadItem {
  name: string;
  total_interviews: number;
  completed: number;
  pending_feedback: number;
}

export interface InterviewerWorkloadData {
  interviewers: InterviewerWorkloadItem[];
  no_show_rate: number;
  reschedule_rate: number;
  total_rounds: number;
}

export interface RejectionAndOffersData {
  rejection_reasons: { reason: string; count: number; percent: number }[];
  total_rejections: number;
  offers_extended: number;
  offers_accepted: number;
  offers_declined: number;
  offer_acceptance_rate: number | null;
}

export interface MissedCandidateItem {
  id: string;
  name: string;
  role: string;
  matched_job: string;
  job_id: string;
  match_pct: number;
  days_in_pool: number;
  matched_skills: string[];
}

export interface AiRecommendationsData {
  missed_candidates: MissedCandidateItem[];
}

export interface DashboardInsights {
  needsAttention: AttentionItem[];
  todaysInterviews: TodayInterviewItem[];
  applicationsTrend: ApplicationsTrendData;
  sourceOfHire: SourceOfHireItem[];
  openJobsHealth: OpenJobHealthItem[];
  skillsGap: SkillGapItem[];
  parsingQuality: ParsingQualityData;
  candidateExtras: CandidateExtrasData;
  interviewerWorkload: InterviewerWorkloadData;
  rejectionAndOffers: RejectionAndOffersData;
  aiRecommendations: AiRecommendationsData;
}
