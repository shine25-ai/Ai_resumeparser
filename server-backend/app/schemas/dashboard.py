from typing import List, Optional
from pydantic import BaseModel


class StatItem(BaseModel):
    label: str
    value: str
    change: str = ""
    changeColor: str = "text-slate-400"
    key: Optional[str] = None
    subtitle: Optional[str] = None
    tooltip: Optional[str] = None
    trend_direction: Optional[str] = None  # "up" | "down" | "flat"
    trend_percent: Optional[float] = None
    trend_delta: Optional[int] = None
    trend_label: Optional[str] = None


class PipelineItem(BaseModel):
    stage: str
    count: str
    width: str
    bg: str
    avg_days_in_stage: Optional[float] = None
    dropoff_percent: Optional[float] = None
    conversion_from_prev_percent: Optional[float] = None
    stuck_count: int = 0
    definition: Optional[str] = None


class StatusItem(BaseModel):
    name: str
    percentage: str
    count: int
    color: str
    avg_days_in_stage: Optional[float] = None
    stuck_count: int = 0


class ActivityItem(BaseModel):
    title: str
    time: str
    icon_type: str  # string representation of the icon (e.g., 'file', 'sparkles', 'check', 'video')
    bg: str
    action: Optional[str] = None
    email: Optional[str] = None
    details: Optional[str] = None


class UpcomingInterviewItem(BaseModel):
    time: str
    role: str
    candidate: str
    id: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    candidate_id: Optional[str] = None
    status: Optional[str] = None


class DashboardStatsResponse(BaseModel):
    stats: List[StatItem]
    window: str = "24h"
    tzOffsetMinutes: int = 0


class DashboardPipelineResponse(BaseModel):
    pipelineData: List[PipelineItem]
    statusData: List[StatusItem]
    stuckThresholdDays: int = 7
    totalStuckCount: int = 0
    uniqueCandidatesInterviewed: int = 0
    totalInterviewRounds: int = 0
    activeInterviewingCount: int = 0


class DashboardActivitiesResponse(BaseModel):
    recentActivities: List[ActivityItem]


class DashboardUpcomingInterviewsResponse(BaseModel):
    upcomingInterviews: List[UpcomingInterviewItem]


class DashboardDistributionsResponse(BaseModel):
    seniorityDistribution: List[StatusItem] = []
    domainDistribution: List[StatusItem] = []


class DashboardNotificationItem(BaseModel):
    id: str
    type: str  # "stuck" | "interview" | "application" | "parse" | "feedback"
    severity: str = "info"  # "warning" | "info" | "success"
    title: str
    description: str
    time: str
    actionPath: str = "/"


class DashboardNotificationsResponse(BaseModel):
    notifications: List[DashboardNotificationItem] = []


class DashboardMetricsResponse(BaseModel):
    stats: List[StatItem]
    pipelineData: List[PipelineItem]
    statusData: List[StatusItem]
    seniorityDistribution: Optional[List[StatusItem]] = []
    domainDistribution: Optional[List[StatusItem]] = []
    recentActivities: List[ActivityItem]
    upcomingInterviews: List[UpcomingInterviewItem]
    stuckThresholdDays: int = 7
    totalStuckCount: int = 0
    uniqueCandidatesInterviewed: int = 0
    totalInterviewRounds: int = 0
    activeInterviewingCount: int = 0
    window: str = "24h"
    tzOffsetMinutes: int = 0
