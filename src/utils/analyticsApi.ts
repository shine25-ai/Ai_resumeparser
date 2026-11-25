import { BASE_URL, apiFetch } from "./Api";

export interface DashboardKpiItem {
  value: number;
  change_pct: number;
  change_label?: string;
  value_days?: number;
  previous_days?: number;
}

export interface ActivityTrendItem {
  date: string;
  applications: number;
  interviews: number;
  hires: number;
}

export interface FunnelStageItem {
  stage: string;
  count: number;
  percentage: number;
  conversion_label?: string;
  conversion_rate?: number;
}

export interface RecentCompanyItem {
  index: number;
  id: string;
  name: string;
  industry: string;
  jobs: number;
  candidates: number;
  status: string;
  created_on: string;
  logo_url?: string;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  time_ago: string;
  actor_name: string;
  entity_type: string;
}

export interface PlatformDashboardData {
  kpis: {
    total_companies: DashboardKpiItem;
    active_companies: DashboardKpiItem;
    active_jobs: DashboardKpiItem;
    total_candidates: DashboardKpiItem;
    interviews: DashboardKpiItem;
    hires: DashboardKpiItem;
  };
  activity_trend: ActivityTrendItem[];
  funnel: FunnelStageItem[];
  recent_companies: RecentCompanyItem[];
  company_activity: {
    new_companies_registered: number;
    jobs_published: number;
    new_candidates: number;
    interviews_scheduled: number;
    candidates_selected: number;
    jobs_closing_7d: number;
  };
  recent_activity: RecentActivityItem[];
  range_days?: number;
  start_date: string;
  end_date: string;
}

export interface RecentJobItem {
  id: string;
  title: string;
  applicants: number;
  status: string;
}

export interface UpcomingInterviewItem {
  id: string;
  date_badge: string;
  job_title: string;
  candidate_name: string;
  time_window: string;
  panel_label: string;
}

export interface RecentCandidateItem {
  id: string;
  name: string;
  role_experience: string;
  rating: number;
  stage: string;
  photo_url?: string;
}

export interface CompanyDashboardData {
  kpis: {
    active_jobs: DashboardKpiItem;
    total_candidates: DashboardKpiItem;
    new_applications: DashboardKpiItem;
    interviews: DashboardKpiItem;
    hires: DashboardKpiItem;
    avg_time_to_hire: DashboardKpiItem;
  };
  funnel: FunnelStageItem[];
  recruitment_trend: ActivityTrendItem[];
  recent_jobs: RecentJobItem[];
  upcoming_interviews: UpcomingInterviewItem[];
  recent_candidates: RecentCandidateItem[];
  range_days?: number;
  start_date: string;
  end_date: string;
}

export interface HiringTrendMonthItem {
  month: string;
  applications: number;
  hired: number;
}

export interface ApplicationSourceItem {
  source: string;
  count: number;
  percentage: number;
  color: string;
}

export interface DepartmentFillItem {
  department: string;
  hired: number;
  openings: number;
  fill_rate: number;
}

export interface RecruiterProductivityItem {
  recruiter_id: string;
  recruiter_name: string;
  applications: number;
  interviews: number;
  hired: number;
  hire_rate: number;
}

export interface KeyInsightItem {
  id: string;
  text: string;
  category: string;
}

export interface RecruitmentReportsData {
  kpis: {
    jobs_opened: DashboardKpiItem;
    applications: DashboardKpiItem;
    shortlisted: DashboardKpiItem;
    interviews: DashboardKpiItem;
    hired: DashboardKpiItem;
    time_to_hire: DashboardKpiItem;
  };
  funnel: FunnelStageItem[];
  hiring_trend: HiringTrendMonthItem[];
  applications_by_source: ApplicationSourceItem[];
  hiring_by_department: DepartmentFillItem[];
  recruiter_performance: RecruiterProductivityItem[];
  key_insights: KeyInsightItem[];
  range_days?: number;
  start_date: string;
  end_date: string;
}

export async function fetchPlatformDashboard(
  days: number = 30,
  startDate?: string,
  endDate?: string
): Promise<PlatformDashboardData> {
  const q = new URLSearchParams();
  if (days) q.set("days", String(days));
  if (startDate) q.set("start_date", startDate);
  if (endDate) q.set("end_date", endDate);

  const res = await apiFetch(`${BASE_URL}/analytics/platform-dashboard?${q.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.detail || "Failed to load platform dashboard");
  return json.data;
}

export async function fetchCompanyDashboard(
  days: number = 30,
  startDate?: string,
  endDate?: string
): Promise<CompanyDashboardData> {
  const q = new URLSearchParams();
  if (days) q.set("days", String(days));
  if (startDate) q.set("start_date", startDate);
  if (endDate) q.set("end_date", endDate);

  const res = await apiFetch(`${BASE_URL}/analytics/company-dashboard?${q.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.detail || "Failed to load company dashboard");
  return json.data;
}

export interface ReportQueryParams {
  days?: number;
  allTime?: boolean;
  startDate?: string;
  endDate?: string;
  jobId?: string;
  department?: string;
  recruiterId?: string;
}

export async function fetchRecruitmentReports(params: ReportQueryParams = {}): Promise<RecruitmentReportsData> {
  const q = new URLSearchParams();
  if (params.allTime) {
    q.set("all_time", "true");
  } else if (params.days) {
    q.set("days", String(params.days));
  }
  if (params.startDate) q.set("start_date", params.startDate);
  if (params.endDate) q.set("end_date", params.endDate);
  if (params.jobId && params.jobId !== "all") q.set("job_id", params.jobId);
  if (params.department && params.department !== "all") q.set("department", params.department);
  if (params.recruiterId && params.recruiterId !== "all") q.set("recruiter_id", params.recruiterId);

  const res = await apiFetch(`${BASE_URL}/analytics/reports?${q.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.detail || "Failed to load recruitment reports");
  return json.data;
}

export async function downloadRecruitmentReportsCsv(params: ReportQueryParams = {}): Promise<void> {
  const q = new URLSearchParams();
  if (params.allTime) {
    q.set("all_time", "true");
  } else if (params.days) {
    q.set("days", String(params.days));
  }
  if (params.startDate) q.set("start_date", params.startDate);
  if (params.endDate) q.set("end_date", params.endDate);
  if (params.jobId && params.jobId !== "all") q.set("job_id", params.jobId);
  if (params.department && params.department !== "all") q.set("department", params.department);
  if (params.recruiterId && params.recruiterId !== "all") q.set("recruiter_id", params.recruiterId);

  const res = await apiFetch(`${BASE_URL}/analytics/reports/export?${q.toString()}`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.message || errJson.detail || "Failed to export reports: Permission denied");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recruitment_report_${params.days || 90}d.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
